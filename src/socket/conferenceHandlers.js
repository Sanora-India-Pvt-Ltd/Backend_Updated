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
    pollStatsService,
    timerIntervals
} = require('../app/services/conferencePolling');

const currentSlideStorage = new Map(); // conferenceId -> slideIndex

/**
 * Log socket event with structured format
 */
const logSocketEvent = (direction, eventName, data) => {
    const timestamp = new Date().toISOString();
    const logData = {
        timestamp,
        direction, // 'IN' or 'OUT'
        event: eventName,
        ...data
    };
    console.log(`[SOCKET-${direction}] ${eventName}`, JSON.stringify(logData, null, 2));
};

/**
 * Push question live (internal reusable function)
 */
async function pushQuestionLiveInternal(io, conferenceId, questionId, duration) {
    // Check conference status
    const status = await conferenceService.getStatus(conferenceId);
    if (status !== 'ACTIVE') {
        throw new Error('Conference must be ACTIVE to push questions live');
    }

    // Acquire lock to prevent concurrent pushes
    const lockKey = `conference:${conferenceId}:lock:push_question`;
    const lockAcquired = await lockService.acquire(lockKey, 5);
    if (!lockAcquired) {
        throw new Error('Another operation is in progress');
    }

    try {
        // Load question from MongoDB
        const question = await ConferenceQuestion.findById(questionId);
        if (!question || question.conferenceId.toString() !== conferenceId) {
            throw new Error('Question not found');
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
            logSocketEvent('OUT', 'question:closed', {
                conferenceId,
                questionId: existingLive.questionId,
                reason: 'manual',
                room: `conference:${conferenceId}`,
                triggeredBy: 'push_new_question'
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

        // Initialize poll statistics (votes hash with all options set to 0)
        // This ensures all options are tracked even if no votes are cast
        const redis = require('../core/infra/cache').getClient();
        if (redis) {
            const pollVotesKey = `conference:${conferenceId}:question:${questionId}:votes`;
            const initialVotes = {};
            question.options.forEach(opt => {
                initialVotes[opt.key.toUpperCase()] = '0';
            });
            await redis.hset(pollVotesKey, initialVotes);
            await redis.expire(pollVotesKey, 3600);
        }
        // In-memory fallback is handled automatically by pollStatsService.getVotes()

        // Start timer countdown
        startQuestionTimer(io, conferenceId, questionId, duration);

        // Emit question live event (include PPT slide/page index when set)
        const liveQuestionData = {
            conferenceId,
            questionId,
            questionText: question.questionText,
            options: question.options,
            duration,
            startedAt: Date.now(),
            expiresAt: Date.now() + (duration * 1000)
        };
        if (question.slideIndex != null) {
            liveQuestionData.slideIndex = question.slideIndex;
        }

        io.to(`conference:${conferenceId}`).emit('question:live', liveQuestionData);
        logSocketEvent('OUT', 'question:live', {
            conferenceId,
            questionId,
            duration,
            room: `conference:${conferenceId}`,
            startedAt: liveQuestionData.startedAt,
            expiresAt: liveQuestionData.expiresAt
        });

        // Emit initial poll stats to HOST/SPEAKER (with zero counts)
        await emitPollLiveStats(io, conferenceId, questionId);
        logSocketEvent('OUT', 'poll:live-stats', {
            conferenceId,
            questionId,
            room: `host:${conferenceId}`,
            triggeredBy: 'question:push_live'
        });

        console.log(`📊 Question ${questionId} pushed live in conference ${conferenceId} (${duration}s)`);
    } finally {
        await lockService.release(lockKey);
    }
}

/**
 * Initialize conference polling handlers
 * @param {Server} io - Socket.IO server instance
 */
const initConferenceHandlers = (io) => {
    io.on('connection', (socket) => {
        const userId = socket.userId;
        const user = socket.user;

        logSocketEvent('IN', 'connection', {
            userId: userId?.toString(),
            socketId: socket.id,
            event: 'conference_handlers_connection'
        });

        // Store active conferences for this socket
        const activeConferences = new Set();

        /**
         * Handle conference join
         */
        socket.on('conference:join', async (data) => {
            try {
                logSocketEvent('IN', 'conference:join', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: { conferenceId: data?.conferenceId }
                });

                const { conferenceId } = data;
                
                if (!conferenceId) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'conference:join',
                        error: 'INVALID_REQUEST',
                        message: 'Conference ID is required'
                    });
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID is required',
                        timestamp: Date.now()
                    });
                }

                // Validate conference exists and get status
                const conference = await Conference.findById(conferenceId);
                if (!conference) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'conference:join',
                        conferenceId,
                        error: 'CONFERENCE_NOT_FOUND'
                    });
                    return socket.emit('error', {
                        code: 'CONFERENCE_NOT_FOUND',
                        message: 'Conference not found',
                        timestamp: Date.now()
                    });
                }

                // Check conference status
                const status = await conferenceService.getStatus(conferenceId) || conference.status;
                if (status === 'ENDED') {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'conference:join',
                        conferenceId,
                        error: 'CONFERENCE_ENDED'
                    });
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
                            if (liveQuestion.slideIndex != null) {
                                liveQuestionData.slideIndex = liveQuestion.slideIndex;
                            }
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
                logSocketEvent('OUT', 'conference:joined', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    conferenceId,
                    role,
                    audienceCount,
                    hasLiveQuestion: !!liveQuestionData
                });

                // Emit audience joined to host (if user is audience)
                if (!isHost) {
                    io.to(`host:${conferenceId}`).emit('audience:joined', {
                        conferenceId,
                        userId,
                        audienceCount,
                        timestamp: Date.now()
                    });
                    logSocketEvent('OUT', 'audience:joined', {
                        userId: userId?.toString(),
                        conferenceId,
                        audienceCount,
                        room: `host:${conferenceId}`
                    });
                }

                // Broadcast audience count update
                io.to(`conference:${conferenceId}`).emit('audience:count', {
                    conferenceId,
                    audienceCount,
                    timestamp: Date.now()
                });
                logSocketEvent('OUT', 'audience:count', {
                    conferenceId,
                    audienceCount,
                    room: `conference:${conferenceId}`
                });

                console.log(`✅ User ${userId} joined conference ${conferenceId} as ${role}`);
            } catch (error) {
                console.error('Conference join error:', error);
                logSocketEvent('OUT', 'error', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    event: 'conference:join',
                    error: 'INTERNAL_ERROR',
                    errorMessage: error.message
                });
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
                logSocketEvent('IN', 'conference:leave', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: { conferenceId: data?.conferenceId }
                });

                const { conferenceId } = data;
                
                if (!conferenceId) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'conference:leave',
                        error: 'INVALID_REQUEST',
                        message: 'Conference ID is required'
                    });
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
                logSocketEvent('OUT', 'conference:left', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    conferenceId
                });

                // Emit audience left to host (if user was audience)
                if (!isHost) {
                    io.to(`host:${conferenceId}`).emit('audience:left', {
                        conferenceId,
                        userId,
                        audienceCount,
                        timestamp: Date.now()
                    });
                    logSocketEvent('OUT', 'audience:left', {
                        userId: userId?.toString(),
                        conferenceId,
                        audienceCount,
                        room: `host:${conferenceId}`
                    });
                }

                // Broadcast audience count update
                io.to(`conference:${conferenceId}`).emit('audience:count', {
                    conferenceId,
                    audienceCount,
                    timestamp: Date.now()
                });
                logSocketEvent('OUT', 'audience:count', {
                    conferenceId,
                    audienceCount,
                    room: `conference:${conferenceId}`
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
                logSocketEvent('IN', 'question:push_live', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: {
                        conferenceId: data?.conferenceId,
                        questionId: data?.questionId,
                        duration: data?.duration
                    }
                });

                const { conferenceId, questionId, duration = 45 } = data;

                if (!conferenceId || !questionId) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'question:push_live',
                        error: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required'
                    });
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required',
                        timestamp: Date.now()
                    });
                }

                // Validate authority (HOST only)
                const hostId = await conferenceService.getHost(conferenceId);
                if (userId !== hostId) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'question:push_live',
                        conferenceId,
                        questionId,
                        error: 'UNAUTHORIZED',
                        message: 'Only HOST can push questions live'
                    });
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'Only HOST can push questions live',
                        timestamp: Date.now()
                    });
                }

                await pushQuestionLiveInternal(io, conferenceId, questionId, duration);
                logSocketEvent('OUT', 'question:push_live:success', {
                    userId: userId?.toString(),
                    conferenceId,
                    questionId,
                    duration
                });
            } catch (error) {
                console.error('Push question live error:', error);
                let errorCode = 'INTERNAL_ERROR';
                let errorMessage = 'Failed to push question live';

                if (error.message === 'Conference must be ACTIVE to push questions live') {
                    errorCode = 'CONFERENCE_NOT_ACTIVE';
                    errorMessage = error.message;
                } else if (error.message === 'Another operation is in progress') {
                    errorCode = 'OPERATION_IN_PROGRESS';
                    errorMessage = error.message;
                } else if (error.message === 'Question not found') {
                    errorCode = 'QUESTION_NOT_FOUND';
                    errorMessage = error.message;
                }

                socket.emit('error', {
                    code: errorCode,
                    message: errorMessage,
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle question close (HOST only)
         */
        socket.on('question:close', async (data) => {
            try {
                logSocketEvent('IN', 'question:close', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: {
                        conferenceId: data?.conferenceId,
                        questionId: data?.questionId
                    }
                });

                const { conferenceId, questionId } = data;

                if (!conferenceId || !questionId) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'question:close',
                        error: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required'
                    });
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required',
                        timestamp: Date.now()
                    });
                }

                // Validate authority
                const hostId = await conferenceService.getHost(conferenceId);
                if (userId !== hostId) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'question:close',
                        conferenceId,
                        questionId,
                        error: 'UNAUTHORIZED',
                        message: 'Only HOST can close questions'
                    });
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'Only HOST can close questions',
                        timestamp: Date.now()
                    });
                }

                // Close question
                await closeQuestion(io, conferenceId, questionId, 'manual');

                logSocketEvent('OUT', 'question:close:success', {
                    userId: userId?.toString(),
                    conferenceId,
                    questionId,
                    reason: 'manual'
                });
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
         * Handle poll:join - Track participant joining a poll
         */
        socket.on('poll:join', async (data) => {
            try {
                logSocketEvent('IN', 'poll:join', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: {
                        conferenceId: data?.conferenceId,
                        questionId: data?.questionId
                    }
                });

                const { conferenceId, questionId } = data;

                if (!conferenceId || !questionId) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'poll:join',
                        error: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required'
                    });
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID and Question ID are required',
                        timestamp: Date.now()
                    });
                }

                // Check if question is live
                const liveQuestion = await questionService.getLive(conferenceId);
                if (!liveQuestion || liveQuestion.questionId !== questionId) {
                    return socket.emit('error', {
                        code: 'QUESTION_NOT_LIVE',
                        message: 'Question is not live',
                        timestamp: Date.now()
                    });
                }

                // Add participant (only if new)
                const wasNew = await pollStatsService.addParticipant(conferenceId, questionId, userId);
                
                if (wasNew) {
                    // Emit live stats to HOST/SPEAKER only
                    await emitPollLiveStats(io, conferenceId, questionId);
                    logSocketEvent('OUT', 'poll:live-stats', {
                        conferenceId,
                        questionId,
                        room: `host:${conferenceId}`,
                        triggeredBy: 'poll:join'
                    });
                }

                logSocketEvent('OUT', 'poll:join:success', {
                    userId: userId?.toString(),
                    conferenceId,
                    questionId,
                    wasNew
                });
                console.log(`📊 User ${userId} joined poll for question ${questionId}`);
            } catch (error) {
                console.error('Poll join error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to join poll',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle poll:vote - Submit vote and update live statistics
         */
        socket.on('poll:vote', async (data) => {
            try {
                logSocketEvent('IN', 'poll:vote', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: {
                        conferenceId: data?.conferenceId,
                        questionId: data?.questionId,
                        optionKey: data?.optionKey
                    }
                });

                const { conferenceId, questionId, optionKey } = data;

                if (!conferenceId || !questionId || !optionKey) {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'poll:vote',
                        error: 'INVALID_REQUEST',
                        message: 'Conference ID, Question ID, and optionKey are required'
                    });
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID, Question ID, and optionKey are required',
                        timestamp: Date.now()
                    });
                }

                // Validate authority (AUDIENCE only, not HOST)
                const hostId = await conferenceService.getHost(conferenceId);
                if (userId === hostId) {
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'HOST cannot vote in polls',
                        timestamp: Date.now()
                    });
                }

                // Check if question is live
                const liveQuestion = await questionService.getLive(conferenceId);
                if (!liveQuestion || liveQuestion.questionId !== questionId) {
                    return socket.emit('error', {
                        code: 'QUESTION_NOT_LIVE',
                        message: 'Question is not live',
                        timestamp: Date.now()
                    });
                }

                // Get question metadata to validate option
                const meta = await questionService.getQuestionMeta(questionId);
                if (!meta) {
                    return socket.emit('error', {
                        code: 'QUESTION_NOT_FOUND',
                        message: 'Question metadata not found',
                        timestamp: Date.now()
                    });
                }

                const optionKeyUpper = optionKey.toUpperCase();
                const validOptions = meta.options.map(opt => opt.key.toUpperCase());
                if (!validOptions.includes(optionKeyUpper)) {
                    return socket.emit('error', {
                        code: 'INVALID_OPTION',
                        message: 'Invalid option key',
                        timestamp: Date.now()
                    });
                }

                // Track user vote (prevents double voting)
                const wasNewVote = await pollStatsService.trackUserVote(conferenceId, questionId, userId, optionKeyUpper);
                
                if (!wasNewVote) {
                    return socket.emit('error', {
                        code: 'ALREADY_VOTED',
                        message: 'You have already voted on this question',
                        timestamp: Date.now()
                    });
                }

                // Increment vote count atomically
                await pollStatsService.incrementVote(conferenceId, questionId, optionKeyUpper);

                // Emit vote confirmation to sender
                socket.emit('poll:vote:accepted', {
                    conferenceId,
                    questionId,
                    optionKey: optionKeyUpper,
                    timestamp: Date.now()
                });
                logSocketEvent('OUT', 'poll:vote:accepted', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    conferenceId,
                    questionId,
                    optionKey: optionKeyUpper
                });

                // Emit live stats to HOST/SPEAKER only
                await emitPollLiveStats(io, conferenceId, questionId);
                logSocketEvent('OUT', 'poll:live-stats', {
                    conferenceId,
                    questionId,
                    room: `host:${conferenceId}`,
                    triggeredBy: 'poll:vote'
                });

                logSocketEvent('OUT', 'poll:vote:success', {
                    userId: userId?.toString(),
                    conferenceId,
                    questionId,
                    optionKey: optionKeyUpper
                });
                console.log(`✅ Vote recorded: User ${userId} voted ${optionKeyUpper} on question ${questionId}`);
            } catch (error) {
                console.error('Poll vote error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to submit vote',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle vote submission (AUDIENCE only)
         */
        socket.on('vote:submit', async (data) => {
            try {
                logSocketEvent('IN', 'vote:submit', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: {
                        conferenceId: data?.conferenceId,
                        questionId: data?.questionId,
                        selectedOption: data?.selectedOption
                    }
                });

                const { conferenceId, questionId, selectedOption } = data;

                if (!conferenceId || !questionId || !selectedOption) {
                    logSocketEvent('OUT', 'vote:rejected', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        conferenceId: data?.conferenceId,
                        questionId: data?.questionId,
                        reason: 'invalid_request'
                    });
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
                    logSocketEvent('OUT', 'vote:accepted', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        conferenceId,
                        questionId,
                        selectedOption: selectedOptionUpper,
                        isCorrect
                    });

                    // Broadcast updated results to all
                    io.to(`conference:${conferenceId}`).emit('vote:result', {
                        conferenceId,
                        questionId,
                        totalVotes: voteResult.totalVotes,
                        optionCounts: voteResult.optionCounts,
                        timestamp: Date.now()
                    });
                    logSocketEvent('OUT', 'vote:result', {
                        conferenceId,
                        questionId,
                        totalVotes: voteResult.totalVotes,
                        room: `conference:${conferenceId}`
                    });

                    logSocketEvent('OUT', 'vote:submit:success', {
                        userId: userId?.toString(),
                        conferenceId,
                        questionId,
                        selectedOption: selectedOptionUpper
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

        socket.on('presentation:slide_change', async (data) => {
            try {
                logSocketEvent('IN', 'presentation:slide_change', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    data: {
                        conferenceId: data?.conferenceId,
                        slideIndex: data?.slideIndex
                    }
                });

                const { conferenceId, slideIndex } = data;

                if (!conferenceId || typeof slideIndex !== 'number') {
                    logSocketEvent('OUT', 'error', {
                        userId: userId?.toString(),
                        socketId: socket.id,
                        event: 'presentation:slide_change',
                        error: 'INVALID_REQUEST',
                        message: 'Conference ID and slideIndex are required'
                    });
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID and slideIndex are required',
                        timestamp: Date.now()
                    });
                }

                const conference = await Conference.findById(conferenceId);
                if (!conference) {
                    return socket.emit('error', {
                        code: 'CONFERENCE_NOT_FOUND',
                        message: 'Conference not found',
                        timestamp: Date.now()
                    });
                }

                const hostId = await conferenceService.getHost(conferenceId);
                if (!hostId || String(userId) !== String(hostId)) {
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'Only HOST can change slides',
                        timestamp: Date.now()
                    });
                }

                const redis = require('../core/infra/cache').getClient();
                const lockKey = `conference:${conferenceId}:lock:slide_change`;

                if (redis) {
                    const ok = await redis.set(lockKey, Date.now().toString(), 'PX', 500, 'NX');
                    if (ok !== 'OK') return;
                }

                try {
                    // STEP 3: close any live question
                    const liveQuestion = await questionService.getLive(conferenceId);
                    if (liveQuestion) {
                        await closeQuestion(io, conferenceId, liveQuestion.questionId, 'slide_change');
                    }

                    // STEP 4: auto-push question mapped to this slide
                    const question = await ConferenceQuestion.findOne({
                        conferenceId,
                        slideIndex
                    });

                    if (question) {
                        await pushQuestionLiveInternal(
                            io,
                            conferenceId,
                            question._id.toString(),
                            45
                        );
                    }

                    if (redis) {
                        await redis.set(`conference:${conferenceId}:current_slide`, slideIndex);
                    } else {
                        currentSlideStorage.set(conferenceId, slideIndex);
                    }

                    io.to(`conference:${conferenceId}`).emit('presentation:slide_update', {
                        conferenceId,
                        slideIndex,
                        timestamp: Date.now()
                    });
                    logSocketEvent('OUT', 'presentation:slide_update', {
                        conferenceId,
                        slideIndex,
                        room: `conference:${conferenceId}`
                    });
                } finally {
                    if (redis) {
                        await redis.del(lockKey);
                    }
                }
            } catch (err) {
                logSocketEvent('OUT', 'error', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    event: 'presentation:slide_change',
                    error: 'INTERNAL_ERROR',
                    errorMessage: err.message
                });
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Slide change failed',
                    timestamp: Date.now()
                });
            }
        });

        /**
         * Handle disconnect - cleanup
         */
        socket.on('disconnect', async () => {
            try {
                logSocketEvent('IN', 'disconnect', {
                    userId: userId?.toString(),
                    socketId: socket.id
                });

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
                        logSocketEvent('OUT', 'audience:left', {
                            userId: userId?.toString(),
                            conferenceId,
                            audienceCount,
                            room: `host:${conferenceId}`,
                            reason: 'disconnect'
                        });

                        // Broadcast count update
                        io.to(`conference:${conferenceId}`).emit('audience:count', {
                            conferenceId,
                            audienceCount,
                            timestamp: Date.now()
                        });
                        logSocketEvent('OUT', 'audience:count', {
                            conferenceId,
                            audienceCount,
                            room: `conference:${conferenceId}`,
                            reason: 'disconnect'
                        });
                    }
                }

                // Clean up active conferences tracking
                activeConferences.clear();

                logSocketEvent('OUT', 'disconnect:success', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    conferencesCleaned: userConferences.length
                });
                console.log(`🔌 User ${userId} disconnected from conference polling`);
            } catch (error) {
                logSocketEvent('OUT', 'disconnect:error', {
                    userId: userId?.toString(),
                    socketId: socket.id,
                    error: error.message
                });
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
            // Emit timer update (log every 5 seconds to avoid spam)
            io.to(`conference:${conferenceId}`).emit('question:timer_update', {
                conferenceId,
                questionId,
                timeRemaining,
                expiresAt: endTime
            });
            if (timeRemaining % 5 === 0 || timeRemaining <= 5) {
                logSocketEvent('OUT', 'question:timer_update', {
                    conferenceId,
                    questionId,
                    timeRemaining,
                    room: `conference:${conferenceId}`
                });
            }
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
 * Emit poll live statistics to HOST/SPEAKER only
 */
const emitPollLiveStats = async (io, conferenceId, questionId) => {
    try {
        // Get question metadata
        const meta = await questionService.getQuestionMeta(questionId);
        if (!meta) {
            return; // Question metadata not found
        }

        // Get participant count
        const participants = await pollStatsService.getParticipantCount(conferenceId, questionId);

        // Get vote counts
        const votes = await pollStatsService.getVotes(conferenceId, questionId);

        // Calculate total votes
        const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);

        // Build results with counts and percentages
        const results = {};
        meta.options.forEach(opt => {
            const optionKey = opt.key.toUpperCase();
            const count = votes[optionKey] || 0;
            const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            results[optionKey] = {
                count,
                percentage
            };
        });

        // Emit to HOST/SPEAKER room only
        io.to(`host:${conferenceId}`).emit('poll:live-stats', {
            questionId,
            participants,
            totalVotes,
            results,
            timestamp: Date.now()
        });
        // Note: Individual logSocketEvent calls are added at call sites to include context
    } catch (error) {
        console.error('Emit poll live stats error:', error);
    }
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

        // Get final vote counts (use poll stats service for consistency)
        const pollVotes = await pollStatsService.getVotes(conferenceId, questionId);
        const participants = await pollStatsService.getParticipantCount(conferenceId, questionId);
        const voteCounts = await votingService.getVoteCounts(questionId);
        const correctCount = await votingService.getCorrectCount(questionId);
        const meta = await questionService.getQuestionMeta(questionId);

        // Use poll votes if available, otherwise fall back to voting service
        const finalVotes = Object.keys(pollVotes).length > 0 ? pollVotes : voteCounts.optionCounts;
        const totalVotes = Object.values(finalVotes).reduce((sum, count) => sum + count, 0) || voteCounts.totalVotes;

        // Calculate percentages
        const percentageBreakdown = {};
        const results = {};
        if (totalVotes > 0) {
            meta.options.forEach(opt => {
                const optionKey = opt.key.toUpperCase();
                const count = finalVotes[optionKey] || 0;
                const percentage = Math.round((count / totalVotes) * 100);
                percentageBreakdown[optionKey] = percentage;
                results[optionKey] = {
                    count,
                    percentage
                };
            });
        } else {
            // Initialize with zeros if no votes
            meta.options.forEach(opt => {
                const optionKey = opt.key.toUpperCase();
                percentageBreakdown[optionKey] = 0;
                results[optionKey] = {
                    count: 0,
                    percentage: 0
                };
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
        logSocketEvent('OUT', 'question:closed', {
            conferenceId,
            questionId,
            reason,
            room: `conference:${conferenceId}`
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
            logSocketEvent('OUT', 'vote:final_result', {
                conferenceId,
                questionId,
                totalVotes: voteCounts.totalVotes,
                correctOption: meta.correctOption,
                room: `conference:${conferenceId}`
            });
        }

        // Save final results to MongoDB asynchronously (non-blocking)
        saveFinalResultsToMongoDB(questionId, {
            participants,
            totalVotes,
            results,
            counts: finalVotes,
            percentages: percentageBreakdown,
            closedAt: Date.now()
        }).catch(error => {
            console.error(`Failed to save final results for question ${questionId}:`, error);
        });

        // Cleanup poll data and vote data
        await pollStatsService.cleanupPoll(conferenceId, questionId);
        
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
const saveFinalResultsToMongoDB = async (questionId, resultsData) => {
    try {
        const question = await ConferenceQuestion.findById(questionId);
        if (!question) return;

        // Update question with final results
        question.status = 'CLOSED';
        question.results = {
            participants: resultsData.participants || 0,
            totalVotes: resultsData.totalVotes || 0,
            counts: resultsData.counts || {},
            percentages: resultsData.percentages || {},
            results: resultsData.results || {},
            closedAt: resultsData.closedAt || new Date()
        };
        await question.save();

        // Update or create analytics
        let analytics = await ConferenceQuestionAnalytics.findOne({ questionId });
        
        if (!analytics) {
            analytics = await ConferenceQuestionAnalytics.create({
                questionId,
                conferenceId: question.conferenceId,
                totalResponses: resultsData.totalVotes || 0,
                optionCounts: new Map(Object.entries(resultsData.counts || {})),
                correctCount: 0 // Can be calculated from answers if needed
            });
        } else {
            analytics.totalResponses = resultsData.totalVotes || 0;
            analytics.optionCounts = new Map(Object.entries(resultsData.counts || {}));
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

