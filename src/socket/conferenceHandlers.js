/**
 * Conference Polling Socket.IO Handlers
 * Handles real-time conference polling events
 */

const Conference = require('../models/conference/Conference');
const ConferenceQuestion = require('../models/conference/ConferenceQuestion');
const ConferenceQuestionAnalytics = require('../models/conference/ConferenceQuestionAnalytics');
const {
    conferenceService,
    questionService,
    votingService,
    audienceService,
    lockService,
    timerIntervals
} = require('../services/conferencePollingService');

/**
 * Initialize conference polling handlers
 * @param {Server} io - Socket.IO server instance
 */
const initConferenceHandlers = (io) => {
    io.on('connection', (socket) => {
        const userId = socket.userId;
        const user = socket.user;

        // Store active conferences for this socket
        const activeConferences = new Set();

        /**
         * Handle conference join
         */
        socket.on('conference:join', async (data) => {
            try {
                const { conferenceId } = data;
                
                if (!conferenceId) {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID is required',
                        timestamp: Date.now()
                    });
                }

                // Validate conference exists and get status
                const conference = await Conference.findById(conferenceId);
                if (!conference) {
                    return socket.emit('error', {
                        code: 'CONFERENCE_NOT_FOUND',
                        message: 'Conference not found',
                        timestamp: Date.now()
                    });
                }

                // Check conference status
                const status = await conferenceService.getStatus(conferenceId) || conference.status;
                if (status === 'ENDED') {
                    return socket.emit('error', {
                        code: 'CONFERENCE_ENDED',
                        message: 'Conference has ended',
                        timestamp: Date.now()
                    });
                }

                // Determine user role (HOST or AUDIENCE)
                // Host and Speaker are the same entity - check if user is conference host
                let hostId = await conferenceService.getHost(conferenceId);
                if (!hostId) {
                    // Set host from conference (first time)
                    const actualHostId = conference.hostId?.toString();
                    if (actualHostId) {
                        await conferenceService.setHost(conferenceId, actualHostId);
                        hostId = actualHostId;
                    }
                }
                
                // Check if user is host
                // Host and Speaker are the same entity - check direct ID match
                const isHost = hostId && userId === hostId;
                
                const role = isHost ? 'HOST' : 'AUDIENCE';

                // Join Socket.IO rooms
                socket.join(`conference:${conferenceId}`);
                if (isHost) {
                    socket.join(`host:${conferenceId}`);
                }

                // Update audience presence
                if (!isHost) {
                    await audienceService.addUser(conferenceId, userId);
                }

                // Get current state
                const liveQuestion = await questionService.getLive(conferenceId);
                const audienceCount = await audienceService.getCount(conferenceId);

                // Get live question details if exists
                let liveQuestionData = null;
                if (liveQuestion) {
                    const question = await ConferenceQuestion.findById(liveQuestion.questionId);
                    if (question) {
                        const meta = await questionService.getQuestionMeta(liveQuestion.questionId);
                        if (meta) {
                            liveQuestionData = {
                                questionId: liveQuestion.questionId,
                                questionText: meta.questionText,
                                options: meta.options,
                                duration: liveQuestion.duration,
                                startedAt: liveQuestion.startedAt,
                                expiresAt: liveQuestion.expiresAt
                            };
                        }
                    }
                }

                // Track active conference
                activeConferences.add(conferenceId);

                // Emit join confirmation
                socket.emit('conference:joined', {
                    conferenceId,
                    conferenceStatus: status,
                    liveQuestion: liveQuestionData,
                    audienceCount,
                    role,
                    timestamp: Date.now()
                });

                // Emit audience joined to host (if user is audience)
                if (!isHost) {
                    io.to(`host:${conferenceId}`).emit('audience:joined', {
                        conferenceId,
                        userId,
                        audienceCount,
                        timestamp: Date.now()
                    });
                }

                // Broadcast audience count update
                io.to(`conference:${conferenceId}`).emit('audience:count', {
                    conferenceId,
                    audienceCount,
                    timestamp: Date.now()
                });

                console.log(`✅ User ${userId} joined conference ${conferenceId} as ${role}`);
            } catch (error) {
                console.error('Conference join error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to join conference',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle conference leave
         */
        socket.on('conference:leave', async (data) => {
            try {
                const { conferenceId } = data;
                
                if (!conferenceId) {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID is required',
                        timestamp: Date.now()
                    });
                }

                // Check if user is host
                const hostId = await conferenceService.getHost(conferenceId);
                const isHost = userId === hostId;

                // Leave Socket.IO rooms
                socket.leave(`conference:${conferenceId}`);
                socket.leave(`host:${conferenceId}`);

                // Update audience presence
                if (!isHost) {
                    await audienceService.removeUser(conferenceId, userId);
                }

                // Get updated count
                const audienceCount = await audienceService.getCount(conferenceId);

                // Remove from active conferences
                activeConferences.delete(conferenceId);

                // Emit leave confirmation
                socket.emit('conference:left', {
                    conferenceId,
                    timestamp: Date.now()
                });

                // Emit audience left to host (if user was audience)
                if (!isHost) {
                    io.to(`host:${conferenceId}`).emit('audience:left', {
                        conferenceId,
                        userId,
                        audienceCount,
                        timestamp: Date.now()
                    });
                }

                // Broadcast audience count update
                io.to(`conference:${conferenceId}`).emit('audience:count', {
                    conferenceId,
                    audienceCount,
                    timestamp: Date.now()
                });

                console.log(`❌ User ${userId} left conference ${conferenceId}`);
            } catch (error) {
                console.error('Conference leave error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to leave conference',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle question push live (HOST only)
         */
        socket.on('question:push_live', async (data) => {
            try {
                const { conferenceId, questionId, duration = 45 } = data;

                if (!conferenceId || !questionId) {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required',
                        timestamp: Date.now()
                    });
                }

                // Validate authority (HOST only)
                const hostId = await conferenceService.getHost(conferenceId);
                if (userId !== hostId) {
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'Only HOST can push questions live',
                        timestamp: Date.now()
                    });
                }

                // Check conference status
                const status = await conferenceService.getStatus(conferenceId);
                if (status !== 'ACTIVE') {
                    return socket.emit('error', {
                        code: 'CONFERENCE_NOT_ACTIVE',
                        message: 'Conference must be ACTIVE to push questions live',
                        timestamp: Date.now()
                    });
                }

                // Acquire lock to prevent concurrent pushes
                const lockKey = `conference:${conferenceId}:lock:push_question`;
                const lockAcquired = await lockService.acquire(lockKey, 5);
                if (!lockAcquired) {
                    return socket.emit('error', {
                        code: 'OPERATION_IN_PROGRESS',
                        message: 'Another operation is in progress',
                        timestamp: Date.now()
                    });
                }

                try {
                    // Load question from MongoDB
                    const question = await ConferenceQuestion.findById(questionId);
                    if (!question || question.conferenceId.toString() !== conferenceId) {
                        await lockService.release(lockKey);
                        return socket.emit('error', {
                            code: 'QUESTION_NOT_FOUND',
                            message: 'Question not found',
                            timestamp: Date.now()
                        });
                    }

                    // Close existing live question if any
                    const existingLive = await questionService.getLive(conferenceId);
                    if (existingLive) {
                        await questionService.closeLive(conferenceId);
                        io.to(`conference:${conferenceId}`).emit('question:closed', {
                            conferenceId,
                            questionId: existingLive.questionId,
                            reason: 'manual',
                            closedAt: Date.now()
                        });
                    }

                    // Cache question metadata
                    await questionService.cacheQuestionMeta(questionId, {
                        conferenceId: question.conferenceId.toString(),
                        questionText: question.questionText,
                        options: question.options,
                        correctOption: question.correctOption,
                        status: 'ACTIVE'
                    });

                    // Set question as live
                    await questionService.setLive(conferenceId, questionId, duration);

                    // Initialize vote counts
                    await votingService.initializeVotes(questionId, question.options);

                    // Start timer countdown
                    startQuestionTimer(io, conferenceId, questionId, duration);

                    // Emit question live event
                    const liveQuestionData = {
                        conferenceId,
                        questionId,
                        questionText: question.questionText,
                        options: question.options,
                        duration,
                        startedAt: Date.now(),
                        expiresAt: Date.now() + (duration * 1000)
                    };

                    io.to(`conference:${conferenceId}`).emit('question:live', liveQuestionData);

                    console.log(`📊 Question ${questionId} pushed live in conference ${conferenceId} (${duration}s)`);
                } finally {
                    await lockService.release(lockKey);
                }
            } catch (error) {
                console.error('Push question live error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to push question live',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle question close (HOST only)
         */
        socket.on('question:close', async (data) => {
            try {
                const { conferenceId, questionId } = data;

                if (!conferenceId || !questionId) {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required',
                        timestamp: Date.now()
                    });
                }

                // Validate authority
                const hostId = await conferenceService.getHost(conferenceId);
                if (userId !== hostId) {
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'Only HOST can close questions',
                        timestamp: Date.now()
                    });
                }

                // Close question
                await closeQuestion(io, conferenceId, questionId, 'manual');

                console.log(`🔒 Question ${questionId} closed manually in conference ${conferenceId}`);
            } catch (error) {
                console.error('Close question error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to close question',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle vote submission (AUDIENCE only)
         */
        socket.on('vote:submit', async (data) => {
            try {
                const { conferenceId, questionId, selectedOption } = data;

                if (!conferenceId || !questionId || !selectedOption) {
                    return socket.emit('vote:rejected', {
                        conferenceId,
                        questionId,
                        reason: 'invalid_request',
                        timestamp: Date.now()
                    });
                }

                // Validate authority (not HOST)
                const hostId = await conferenceService.getHost(conferenceId);
                if (userId === hostId) {
                    return socket.emit('vote:rejected', {
                        conferenceId,
                        questionId,
                        reason: 'not_audience',
                        timestamp: Date.now()
                    });
                }

                // Check question is live
                const liveQuestion = await questionService.getLive(conferenceId);
                if (!liveQuestion || liveQuestion.questionId !== questionId) {
                    return socket.emit('vote:rejected', {
                        conferenceId,
                        questionId,
                        reason: 'question_closed',
                        timestamp: Date.now()
                    });
                }

                // Acquire vote lock (prevent race condition)
                const lockKey = `question:${questionId}:lock:vote:${userId}`;
                const lockAcquired = await lockService.acquire(lockKey, 2);
                if (!lockAcquired) {
                    return socket.emit('vote:rejected', {
                        conferenceId,
                        questionId,
                        reason: 'duplicate',
                        timestamp: Date.now()
                    });
                }

                try {
                    // Check duplicate vote
                    const hasVoted = await votingService.hasVoted(questionId, userId);
                    if (hasVoted) {
                        await lockService.release(lockKey);
                        return socket.emit('vote:rejected', {
                            conferenceId,
                            questionId,
                            reason: 'duplicate',
                            timestamp: Date.now()
                        });
                    }

                    // Get question metadata to validate option and check correctness
                    const meta = await questionService.getQuestionMeta(questionId);
                    if (!meta) {
                        await lockService.release(lockKey);
                        return socket.emit('vote:rejected', {
                            conferenceId,
                            questionId,
                            reason: 'question_not_found',
                            timestamp: Date.now()
                        });
                    }

                    const selectedOptionUpper = selectedOption.toUpperCase();
                    const validOptions = meta.options.map(opt => opt.key.toUpperCase());
                    if (!validOptions.includes(selectedOptionUpper)) {
                        await lockService.release(lockKey);
                        return socket.emit('vote:rejected', {
                            conferenceId,
                            questionId,
                            reason: 'invalid_option',
                            timestamp: Date.now()
                        });
                    }

                    // Submit vote
                    const isCorrect = selectedOptionUpper === meta.correctOption.toUpperCase();
                    const voteResult = await votingService.submitVote(
                        questionId,
                        userId,
                        selectedOptionUpper,
                        isCorrect
                    );

                    if (!voteResult.success) {
                        await lockService.release(lockKey);
                        return socket.emit('vote:rejected', {
                            conferenceId,
                            questionId,
                            reason: voteResult.reason || 'duplicate',
                            timestamp: Date.now()
                        });
                    }

                    // Emit vote accepted to sender
                    socket.emit('vote:accepted', {
                        conferenceId,
                        questionId,
                        selectedOption: selectedOptionUpper,
                        isCorrect,
                        timestamp: Date.now()
                    });

                    // Broadcast updated results to all
                    io.to(`conference:${conferenceId}`).emit('vote:result', {
                        conferenceId,
                        questionId,
                        totalVotes: voteResult.totalVotes,
                        optionCounts: voteResult.optionCounts,
                        timestamp: Date.now()
                    });

                    console.log(`✅ Vote submitted: User ${userId} voted ${selectedOptionUpper} on question ${questionId}`);
                } finally {
                    await lockService.release(lockKey);
                }
            } catch (error) {
                console.error('Vote submission error:', error);
                socket.emit('vote:rejected', {
                    conferenceId: data?.conferenceId,
                    questionId: data?.questionId,
                    reason: 'internal_error',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle disconnect - cleanup
         */
        socket.on('disconnect', async () => {
            try {
                // Remove user from all active conferences
                const userConferences = await audienceService.getUserConferences(userId);
                
                for (const conferenceId of userConferences) {
                    const hostId = await conferenceService.getHost(conferenceId);
                    const isHost = userId === hostId;

                    if (!isHost) {
                        await audienceService.removeUser(conferenceId, userId);
                        const audienceCount = await audienceService.getCount(conferenceId);

                        // Notify host
                        io.to(`host:${conferenceId}`).emit('audience:left', {
                            conferenceId,
                            userId,
                            audienceCount,
                            timestamp: Date.now()
                        });

                        // Broadcast count update
                        io.to(`conference:${conferenceId}`).emit('audience:count', {
                            conferenceId,
                            audienceCount,
                            timestamp: Date.now()
                        });
                    }
                }

                // Clean up active conferences tracking
                activeConferences.clear();

                console.log(`🔌 User ${userId} disconnected from conference polling`);
            } catch (error) {
                console.error('Disconnect cleanup error:', error);
            }
        });
    });
};

/**
 * Start question timer countdown
 */
const startQuestionTimer = (io, conferenceId, questionId, duration) => {
    // Clear any existing timer
    const existingInterval = timerIntervals.get(questionId);
    if (existingInterval) {
        clearInterval(existingInterval);
    }

    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);

    // Emit timer updates every second
    const intervalId = setInterval(async () => {
        const now = Date.now();
        const timeRemaining = Math.max(0, Math.floor((endTime - now) / 1000));

        // Check if question is still live
        const liveQuestion = await questionService.getLive(conferenceId);
        if (!liveQuestion || liveQuestion.questionId !== questionId) {
            clearInterval(intervalId);
            timerIntervals.delete(questionId);
            return;
        }

        if (timeRemaining > 0) {
            // Emit timer update
            io.to(`conference:${conferenceId}`).emit('question:timer_update', {
                conferenceId,
                questionId,
                timeRemaining,
                expiresAt: endTime
            });
        } else {
            // Timer expired - close question
            clearInterval(intervalId);
            timerIntervals.delete(questionId);
            await closeQuestion(io, conferenceId, questionId, 'timeout');
        }
    }, 1000);

    timerIntervals.set(questionId, intervalId);
};

/**
 * Close question and broadcast final results
 */
const closeQuestion = async (io, conferenceId, questionId, reason) => {
    try {
        // Verify question is still live
        const liveQuestion = await questionService.getLive(conferenceId);
        if (!liveQuestion || liveQuestion.questionId !== questionId) {
            return; // Already closed
        }

        // Get final vote counts
        const voteCounts = await votingService.getVoteCounts(questionId);
        const correctCount = await votingService.getCorrectCount(questionId);
        const meta = await questionService.getQuestionMeta(questionId);

        // Calculate percentages
        const percentageBreakdown = {};
        if (voteCounts.totalVotes > 0) {
            Object.keys(voteCounts.optionCounts).forEach(option => {
                percentageBreakdown[option] = Math.round(
                    (voteCounts.optionCounts[option] / voteCounts.totalVotes) * 100
                );
            });
        }

        // Close question in Redis
        await questionService.closeLive(conferenceId);

        // Emit question closed
        io.to(`conference:${conferenceId}`).emit('question:closed', {
            conferenceId,
            questionId,
            reason,
            closedAt: Date.now()
        });

        // Emit final results (with correct answer revealed)
        if (meta) {
            io.to(`conference:${conferenceId}`).emit('vote:final_result', {
                conferenceId,
                questionId,
                totalVotes: voteCounts.totalVotes,
                optionCounts: voteCounts.optionCounts,
                correctOption: meta.correctOption,
                correctCount,
                percentageBreakdown,
                closedAt: Date.now()
            });
        }

        // Save final results to MongoDB asynchronously (non-blocking)
        saveFinalResultsToMongoDB(questionId, voteCounts, correctCount).catch(error => {
            console.error(`Failed to save final results for question ${questionId}:`, error);
        });

        // Cleanup vote data after a delay (keep for 1 hour for recovery)
        setTimeout(async () => {
            await votingService.cleanupVotes(questionId);
        }, 3600000); // 1 hour

        console.log(`🔒 Question ${questionId} closed in conference ${conferenceId} (reason: ${reason})`);
    } catch (error) {
        console.error('Close question error:', error);
    }
};

/**
 * Save final results to MongoDB (async, non-blocking)
 */
const saveFinalResultsToMongoDB = async (questionId, voteCounts, correctCount) => {
    try {
        const question = await ConferenceQuestion.findById(questionId);
        if (!question) return;

        // Update or create analytics
        let analytics = await ConferenceQuestionAnalytics.findOne({ questionId });
        
        if (!analytics) {
            analytics = await ConferenceQuestionAnalytics.create({
                questionId,
                conferenceId: question.conferenceId,
                totalResponses: voteCounts.totalVotes,
                optionCounts: new Map(Object.entries(voteCounts.optionCounts)),
                correctCount
            });
        } else {
            analytics.totalResponses = voteCounts.totalVotes;
            analytics.optionCounts = new Map(Object.entries(voteCounts.optionCounts));
            analytics.correctCount = correctCount;
            analytics.lastUpdated = new Date();
            await analytics.save();
        }

        console.log(`💾 Saved final results to MongoDB for question ${questionId}`);
    } catch (error) {
        console.error('Save final results error:', error);
        throw error;
    }
};

module.exports = {
    initConferenceHandlers
};

