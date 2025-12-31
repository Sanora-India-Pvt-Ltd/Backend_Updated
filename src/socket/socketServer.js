const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/authorization/User');
const Message = require('../models/social/Message');
const Conversation = require('../models/social/Conversation');
const ConferenceQuestion = require('../models/conference/ConferenceQuestion');
const { setUserOnline, setUserOffline, isUserOnline, getRedisSubscriber, getRedisPublisher, waitForRedisReady } = require('../config/redisStub');
const { initConferenceHandlers } = require('./conferenceHandlers');
const { getRedis } = require('../config/redisConnection');

let io = null;

// STEP 3: In-memory Map to track server-side timers for auto-closing live questions
// Key: conferenceId, Value: timeoutId
// Why in-memory Map: Timers are per-server-instance and cannot be shared across servers via Redis.
// Each server instance manages its own timers. If Redis TTL expires first, the timer cleanup
// will still work correctly because we check Redis before closing.
const questionTimers = new Map();

const initSocketServer = async (httpServer) => {
    // Wait for Redis connections to be ready (if Redis is configured)
    const redisSubscriber = getRedisSubscriber();
    const redisPublisher = getRedisPublisher();

    // Create Socket.IO server
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || '*',
            credentials: true,
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling']
    });

    // Redis is disabled - using in-memory adapter only
    console.log('ℹ️  Using in-memory Socket.IO adapter (single server only)');

    // Socket authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
            
            if (!token) {
                return next(new Error('Authentication error: Token required'));
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                
                // Support User, Host, and Speaker authentication
                if (decoded.type === 'host') {
                    const Host = require('../models/conference/Host');
                    const host = await Host.findById(decoded.id).select('-security.passwordHash -sessions');
                    if (!host) {
                        return next(new Error('Authentication error: Host not found'));
                    }
                    socket.userId = host._id.toString();
                    socket.user = {
                        _id: host._id,
                        profile: { email: host.account?.email },
                        role: 'HOST'
                    };
                    socket.userType = 'host';
                } else if (decoded.type === 'speaker') {
                    const Speaker = require('../models/conference/Speaker');
                    const speaker = await Speaker.findById(decoded.id).select('-security.passwordHash -sessions');
                    if (!speaker) {
                        return next(new Error('Authentication error: Speaker not found'));
                    }
                    socket.userId = speaker._id.toString();
                    socket.user = {
                        _id: speaker._id,
                        profile: { email: speaker.account?.email },
                        role: 'SPEAKER'
                    };
                    socket.userType = 'speaker';
                } else {
                    // Default to User authentication
                    const user = await User.findById(decoded.id).select('-auth');
                    if (!user) {
                        return next(new Error('Authentication error: User not found'));
                    }
                    socket.userId = user._id.toString();
                    socket.user = user;
                    socket.userType = 'user';
                }

                next();
            } catch (error) {
                return next(new Error('Authentication error: Invalid token'));
            }
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    // ✅ Socket.io Presence Logic (Correct Pattern)
    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`✅ User connected: ${userId}`);

        // FIX #5: Move Redis client acquisition to connection scope
        // Get Redis client once per connection for reuse across handlers
        const redis = getRedis();

        // Track conferences explicitly left by this socket to prevent reprocessing in disconnect
        // FIX #4: Track explicitly left conferences to avoid reprocessing in disconnect cleanup
        const explicitlyLeftConferences = new Set();

        // Set user online in Redis
        await setUserOnline(userId);

        // Join user's personal room
        socket.join(`user:${userId}`);

        // Emit online status to user's contacts
        socket.broadcast.emit('user:online', { userId });

        // Handle joining conversation room
        socket.on('join:conversation', async (data) => {
            try {
                const { conversationId } = data;
                
                // Verify user is a participant
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) {
                    return socket.emit('error', { message: 'Conversation not found' });
                }

                const isParticipant = conversation.participants.some(
                    p => p.toString() === userId
                );

                if (!isParticipant) {
                    return socket.emit('error', { message: 'Not authorized to join this conversation' });
                }

                // Join conversation room
                socket.join(`conversation:${conversationId}`);
                console.log(`User ${userId} joined conversation ${conversationId}`);
            } catch (error) {
                console.error('Join conversation error:', error);
                socket.emit('error', { message: 'Failed to join conversation' });
            }
        });

        // Handle leaving conversation room
        socket.on('leave:conversation', (data) => {
            const { conversationId } = data;
            socket.leave(`conversation:${conversationId}`);
            console.log(`User ${userId} left conversation ${conversationId}`);
        });

        // Handle sending message
        socket.on('send:message', async (data) => {
            try {
                const { conversationId, text, media, messageType, replyTo } = data;

                // Validate conversation
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) {
                    return socket.emit('error', { message: 'Conversation not found' });
                }

                // Verify user is a participant
                const isParticipant = conversation.participants.some(
                    p => p.toString() === userId
                );

                if (!isParticipant) {
                    return socket.emit('error', { message: 'Not authorized to send message' });
                }

                // Check if current user has blocked any participant or vice versa
                const currentUser = await User.findById(userId).select('social.blockedUsers');
                const otherParticipants = conversation.participants.filter(
                    p => p.toString() !== userId
                );

                for (const participantId of otherParticipants) {
                    if (currentUser.social?.blockedUsers && currentUser.social.blockedUsers.includes(participantId)) {
                        return socket.emit('error', { message: 'You cannot send messages to a blocked user' });
                    }

                    const otherUser = await User.findById(participantId).select('social.blockedUsers');
                    if (otherUser.social?.blockedUsers && otherUser.social.blockedUsers.includes(userId)) {
                        return socket.emit('error', { message: 'Action not available' });
                    }
                }

                // Reject audio messages
                if (messageType === 'audio' || (media && media.some(m => m.type === 'audio'))) {
                    return socket.emit('error', { message: 'Audio messages are not allowed' });
                }

                // Create message
                const messageData = {
                    conversationId,
                    senderId: userId,
                    messageType: messageType || 'text',
                    status: 'sent'
                };

                if (text) messageData.text = text;
                if (media && media.length > 0) messageData.media = media;
                if (replyTo) messageData.replyTo = replyTo;

                const message = await Message.create(messageData);
                await message.populate('senderId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
                if (message.replyTo) {
                    await message.populate({
                        path: 'replyTo',
                        populate: {
                            path: 'senderId',
                            select: 'profile.name.first profile.name.last profile.name.full profile.profileImage'
                        }
                    });
                }

                // Transform message sender data
                const messageObj = message.toObject();
                const senderObj = messageObj.senderId?.toObject ? messageObj.senderId.toObject() : messageObj.senderId;
                
                // Extract name from profile structure
                const senderName = senderObj?.profile?.name?.full || 
                                  (senderObj?.profile?.name?.first && senderObj?.profile?.name?.last 
                                      ? `${senderObj.profile.name.first} ${senderObj.profile.name.last}`.trim()
                                      : senderObj?.profile?.name?.first || senderObj?.profile?.name?.last || '');
                
                const senderProfileImage = senderObj?.profile?.profileImage || '';
                
                const transformedMessage = {
                    ...messageObj,
                    senderId: senderObj ? {
                        _id: senderObj._id,
                        name: senderName,
                        profileImage: senderProfileImage
                    } : senderObj
                };

                // Update conversation last message
                conversation.lastMessage = message._id;
                conversation.lastMessageAt = new Date();
                await conversation.save();

                // Emit to all participants in the conversation
                io.to(`conversation:${conversationId}`).emit('new:message', {
                    message: transformedMessage
                });

                // Emit to sender for confirmation
                socket.emit('message:sent', {
                    messageId: message._id,
                    conversationId
                });

                // Mark as delivered for online users
                const participantChecks = await Promise.all(
                    conversation.participants.map(async (participantId) => {
                        if (participantId.toString() === userId) return false;
                        return await isUserOnline(participantId.toString());
                    })
                );
                const onlineParticipants = conversation.participants.filter(
                    (_, index) => participantChecks[index]
                );

                // Update status to delivered for online users
                if (onlineParticipants.length > 0) {
                    await Message.updateOne(
                        { _id: message._id },
                        { status: 'delivered' }
                    );
                    io.to(`conversation:${conversationId}`).emit('message:delivered', {
                        messageId: message._id
                    });
                }

            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle typing indicator
        socket.on('typing:start', async (data) => {
            const { conversationId } = data;
            socket.to(`conversation:${conversationId}`).emit('typing:start', {
                userId,
                conversationId
            });
        });

        socket.on('typing:stop', async (data) => {
            const { conversationId } = data;
            socket.to(`conversation:${conversationId}`).emit('typing:stop', {
                userId,
                conversationId
            });
        });

        // Handle read receipts
        socket.on('message:read', async (data) => {
            try {
                const { messageIds, conversationId } = data;

                // Verify user is a participant
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) {
                    return socket.emit('error', { message: 'Conversation not found' });
                }

                const isParticipant = conversation.participants.some(
                    p => p.toString() === userId
                );

                if (!isParticipant) {
                    return socket.emit('error', { message: 'Not authorized' });
                }

                // Update message status to read
                await Message.updateMany(
                    {
                        _id: { $in: messageIds },
                        conversationId,
                        senderId: { $ne: userId } // Don't mark own messages as read
                    },
                    { status: 'read' }
                );

                // Notify sender
                socket.to(`conversation:${conversationId}`).emit('messages:read', {
                    messageIds,
                    readBy: userId,
                    conversationId
                });

            } catch (error) {
                console.error('Read receipt error:', error);
                socket.emit('error', { message: 'Failed to mark messages as read' });
            }
        });

        // ============================================
        // CONFERENCE JOIN/LEAVE & PRESENCE TRACKING
        // ============================================

        /**
         * Handle conference:join
         * Client emits: { conferenceId: string }
         */
        socket.on('conference:join', async (data) => {
            try {
                const { conferenceId } = data;

                // Validate conferenceId
                if (!conferenceId || typeof conferenceId !== 'string') {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID is required'
                    });
                }

                // Remove from explicitly left set if rejoining
                // FIX #4: Clear explicitly left flag if user rejoins
                explicitlyLeftConferences.delete(conferenceId);

                // 1. Join Socket.IO room
                socket.join(`conference:${conferenceId}`);
                console.log(`📥 User ${userId} joined conference ${conferenceId}`);

                // 2. Determine role (HOST or AUDIENCE)
                // FIX #1: Enforce Host = Speaker - only HOST or AUDIENCE roles
                // Speaker is treated as Host (same entity), so role is determined by hostId match
                let role = 'AUDIENCE';
                if (redis) {
                    try {
                        // Read Redis key: conference:{conferenceId}:host
                        const hostId = await redis.get(`conference:${conferenceId}:host`);
                        if (hostId === userId) {
                            role = 'HOST';
                        }
                        // Note: Speaker authentication is treated as Host if their ID matches hostId
                    } catch (error) {
                        console.error('Redis error reading host:', error);
                        // Continue with AUDIENCE role if Redis fails
                    }
                }

                // FIX 1: JOIN HOST ROOM - If role is HOST, join host-only room
                if (role === 'HOST') {
                    socket.join(`host:${conferenceId}`);
                    console.log(`👑 HOST ${userId} joined host room for conference ${conferenceId}`);
                }

                // 3. Track presence in Redis (only if Redis available)
                let wasNewJoin = false; // Track if this was a new join (not duplicate)
                if (redis) {
                    try {
                        // FIX #2: Check SADD return value to detect duplicate joins
                        // SADD returns 1 if added (new), 0 if already exists (duplicate)
                        const addedToAudience = await redis.sadd(`conference:${conferenceId}:audience`, userId);
                        wasNewJoin = addedToAudience === 1;
                        
                        // Add conferenceId to SET user:{userId}:conferences (for disconnect cleanup)
                        await redis.sadd(`user:${userId}:conferences`, conferenceId);
                    } catch (error) {
                        console.error('Redis error tracking presence:', error);
                        // Continue even if Redis fails, assume new join
                        wasNewJoin = true;
                    }
                } else {
                    // If no Redis, assume new join
                    wasNewJoin = true;
                }

                // 4. Calculate audience count
                let audienceCount = 0;
                if (redis) {
                    try {
                        // SCARD returns count of members in SET
                        audienceCount = await redis.scard(`conference:${conferenceId}:audience`);
                        // Ensure count is never negative
                        if (audienceCount < 0) {
                            audienceCount = 0;
                        }
                    } catch (error) {
                        console.error('Redis error getting audience count:', error);
                        audienceCount = 0;
                    }
                }

                // 5. Emit to joining socket only
                socket.emit('conference:joined', {
                    conferenceId,
                    role,
                    audienceCount
                });

                // FIX #3: On conference:join, if a live question exists in Redis, emit question:live to the joining socket
                // This ensures users who join mid-question receive the current live question
                if (redis) {
                    try {
                        const liveQuestionKey = `conference:${conferenceId}:live_question`;
                        const liveQuestionData = await redis.get(liveQuestionKey);
                        
                        if (liveQuestionData) {
                            // Parse live question data
                            const liveQuestion = JSON.parse(liveQuestionData);
                            
                            // Emit question:live to the joining socket only
                            socket.emit('question:live', {
                                conferenceId: liveQuestion.conferenceId,
                                questionId: liveQuestion.questionId,
                                questionText: liveQuestion.questionText,
                                options: liveQuestion.options,
                                startedAt: liveQuestion.startedAt,
                                expiresAt: liveQuestion.expiresAt
                            });
                            
                            console.log(`📢 Sent live question ${liveQuestion.questionId} to joining user ${userId}`);
                        }
                    } catch (error) {
                        console.error('Redis error checking live question on join:', error);
                        // Continue - this is not critical, user will miss current question but can continue
                    }
                }

                // 6. Broadcast audience count to room (only if new join)
                // FIX #2: Only broadcast if this was a new join (not duplicate)
                // FIX #3: Exclude joining socket from audience:count broadcast
                if (wasNewJoin) {
                    socket.to(`conference:${conferenceId}`).emit('audience:count', {
                        conferenceId,
                        audienceCount
                    });
                }

                console.log(`✅ User ${userId} (${role}) joined conference ${conferenceId}, audience: ${audienceCount}${wasNewJoin ? '' : ' (duplicate join, no broadcast)'}`);

            } catch (error) {
                console.error('Conference join error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to join conference'
                });
            }
        });

        /**
         * Handle conference:leave
         * Client emits: { conferenceId: string }
         */
        socket.on('conference:leave', async (data) => {
            try {
                const { conferenceId } = data;

                // Validate conferenceId
                if (!conferenceId || typeof conferenceId !== 'string') {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID is required'
                    });
                }

                // FIX #4: Mark conference as explicitly left to prevent reprocessing in disconnect
                explicitlyLeftConferences.add(conferenceId);

                // 1. Remove userId from Redis
                if (redis) {
                    try {
                        // Remove from SET conference:{conferenceId}:audience
                        await redis.srem(`conference:${conferenceId}:audience`, userId);
                        
                        // Remove from SET user:{userId}:conferences
                        await redis.srem(`user:${userId}:conferences`, conferenceId);
                    } catch (error) {
                        console.error('Redis error removing presence:', error);
                        // Continue even if Redis fails
                    }
                }

                // 2. Leave Socket.IO room
                socket.leave(`conference:${conferenceId}`);
                console.log(`📤 User ${userId} left conference ${conferenceId}`);

                // FIX 2: LEAVE HOST ROOM - If leaving user is HOST, also leave host-only room
                if (redis) {
                    try {
                        const hostId = await redis.get(`conference:${conferenceId}:host`);
                        if (hostId === userId) {
                            socket.leave(`host:${conferenceId}`);
                            console.log(`👑 HOST ${userId} left host room for conference ${conferenceId}`);
                        }
                    } catch (error) {
                        console.error('Redis error reading host during leave:', error);
                        // Continue - not critical
                    }
                }

                // 3. Recalculate audience count
                let audienceCount = 0;
                if (redis) {
                    try {
                        audienceCount = await redis.scard(`conference:${conferenceId}:audience`);
                        if (audienceCount < 0) {
                            audienceCount = 0;
                        }
                    } catch (error) {
                        console.error('Redis error getting audience count:', error);
                        audienceCount = 0;
                    }
                }

                // 4. Emit to leaving socket only
                socket.emit('conference:left', {
                    conferenceId
                });

                // 5. Broadcast updated audience count (excluding leaving socket)
                // FIX #3: Exclude leaving socket from audience:count broadcast
                socket.to(`conference:${conferenceId}`).emit('audience:count', {
                    conferenceId,
                    audienceCount
                });

                console.log(`✅ User ${userId} left conference ${conferenceId}, audience: ${audienceCount}`);

            } catch (error) {
                console.error('Conference leave error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to leave conference'
                });
            }
        });

        /**
         * STEP 2: Handle question:push_live
         * Client emits: { conferenceId: string, questionId: string, duration?: number }
         * Only HOST can trigger this event
         */
        socket.on('question:push_live', async (data) => {
            try {
                const { conferenceId, questionId, duration = 45 } = data;

                // Validate input
                if (!conferenceId || typeof conferenceId !== 'string') {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID is required'
                    });
                }

                if (!questionId || typeof questionId !== 'string') {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Question ID is required'
                    });
                }

                if (typeof duration !== 'number' || duration <= 0) {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Duration must be a positive number'
                    });
                }

                // Step 1: Verify user is HOST for this conference
                // FIX #1: Enforce Host = Speaker - only HOST can push questions
                let isHost = false;
                if (redis) {
                    try {
                        const hostId = await redis.get(`conference:${conferenceId}:host`);
                        isHost = hostId === userId;
                    } catch (error) {
                        console.error('Redis error reading host:', error);
                        return socket.emit('error', {
                            code: 'INTERNAL_ERROR',
                            message: 'Failed to verify host status'
                        });
                    }
                }

                if (!isHost) {
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'Only HOST can push questions live'
                    });
                }

                // Step 2: Read question from MongoDB (read-only, no modifications)
                const question = await ConferenceQuestion.findOne({
                    _id: questionId,
                    conferenceId: conferenceId
                });

                if (!question) {
                    return socket.emit('error', {
                        code: 'QUESTION_NOT_FOUND',
                        message: 'Question not found or does not belong to this conference'
                    });
                }

                // Step 3: Enforce ONLY ONE live question per conference using Redis
                // FIX #1: Make live question creation atomic using Redis SET with NX option
                // This prevents race conditions when multiple hosts try to push questions simultaneously
                const liveQuestionKey = `conference:${conferenceId}:live_question`;
                
                if (redis) {
                    try {
                        // Step 4: Store live question state in Redis
                        // Calculate timestamps
                        const startedAt = Date.now();
                        const expiresAt = startedAt + (duration * 1000); // duration in seconds

                        const liveQuestionData = {
                            conferenceId,
                            questionId: question._id.toString(),
                            questionText: question.questionText,
                            options: question.options.map(opt => ({
                                key: opt.key,
                                text: opt.text
                            })),
                            startedAt,
                            expiresAt,
                            duration
                        };

                        // FIX #1: Use SET with NX (SET if Not eXists) to atomically create live question
                        // SET key value NX returns 'OK' if key was set, null if key already exists
                        // This prevents race conditions - only one question can be set at a time
                        const ttlSeconds = duration + 5; // duration + 5 seconds buffer
                        const setResult = await redis.set(
                            liveQuestionKey,
                            JSON.stringify(liveQuestionData),
                            'NX' // Only set if key does not exist
                        );

                        if (!setResult) {
                            // Key already exists - another question is live
                            // Check if it's the same question (idempotent) or different
                            const existingLiveQuestion = await redis.get(liveQuestionKey);
                            
                            if (existingLiveQuestion) {
                                const existing = JSON.parse(existingLiveQuestion);
                                
                                // If trying to push the same question, allow it (idempotent)
                                if (existing.questionId === questionId) {
                                    console.log(`ℹ️  Question ${questionId} is already live, re-broadcasting`);
                                    // Update the existing key with new data (overwrite)
                                    // FIX #2: Add TTL when updating existing question using setex (sets value + TTL atomically)
                                    await redis.setex(liveQuestionKey, ttlSeconds, JSON.stringify(liveQuestionData));
                                    // STEP 3: Timer will be started below after this if/else block
                                } else {
                                    return socket.emit('error', {
                                        code: 'QUESTION_ALREADY_LIVE',
                                        message: `Another question (${existing.questionId}) is already live. Close it first.`,
                                        existingQuestionId: existing.questionId
                                    });
                                }
                            } else {
                                // Key was deleted between check and set - retry once
                                const retryResult = await redis.set(
                                    liveQuestionKey,
                                    JSON.stringify(liveQuestionData),
                                    'NX'
                                );
                                if (!retryResult) {
                                    return socket.emit('error', {
                                        code: 'QUESTION_ALREADY_LIVE',
                                        message: 'Another question is being pushed live. Please try again.'
                                    });
                                }
                                // Retry succeeded - set TTL
                                // FIX #2: Add TTL to conference:{conferenceId}:live_question
                                await redis.expire(liveQuestionKey, ttlSeconds);
                            }
                        } else {
                            // SET NX succeeded - key was created
                            // FIX #2: Add TTL to conference:{conferenceId}:live_question
                            // TTL = duration + 5 seconds buffer to ensure cleanup after question expires
                            await redis.expire(liveQuestionKey, ttlSeconds);
                        }

                        // Step 5: Broadcast question:live event to conference room
                        // Broadcast to all sockets in conference:{conferenceId} room
                        io.to(`conference:${conferenceId}`).emit('question:live', {
                            conferenceId,
                            questionId: question._id.toString(),
                            questionText: question.questionText,
                            options: question.options.map(opt => ({
                                key: opt.key,
                                text: opt.text
                            })),
                            startedAt,
                            expiresAt
                        });

                        console.log(`✅ HOST ${userId} pushed question ${questionId} live for conference ${conferenceId} (expires in ${duration}s)`);

                        // STEP 3: Start server-side timer for auto-closing the question
                        // Clear any existing timer for this conference (prevent duplicates)
                        if (questionTimers.has(conferenceId)) {
                            clearTimeout(questionTimers.get(conferenceId));
                            console.log(`⏰ Cleared existing timer for conference ${conferenceId}`);
                        }

                        // Calculate timer duration from expiresAt
                        const timerDuration = expiresAt - Date.now();
                        
                        // Only start timer if duration is positive (question hasn't expired yet)
                        if (timerDuration > 0) {
                            const timeoutId = setTimeout(async () => {
                                try {
                                    // STEP 3: When timer fires, check Redis before closing
                                    // Why re-check Redis: The question may have been manually closed by HOST,
                                    // or Redis TTL may have expired, or another server instance may have closed it.
                                    // This prevents duplicate question:closed events and ensures idempotency.
                                    const liveQuestionKey = `conference:${conferenceId}:live_question`;
                                    const liveQuestionData = await redis.get(liveQuestionKey);
                                    
                                    if (!liveQuestionData) {
                                        // Key does NOT exist → already closed, do nothing
                                        console.log(`ℹ️  Question for conference ${conferenceId} already closed, timer cleanup only`);
                                        questionTimers.delete(conferenceId);
                                        return;
                                    }
                                    
                                    // Key exists → parse data and close the question
                                    const liveQuestion = JSON.parse(liveQuestionData);
                                    
                                    // STEP 5: Final Result Freeze + Persistence
                                    const answersKey = `conference:${conferenceId}:answers:${liveQuestion.questionId}`;
                                    const closedAt = Date.now();
                                    
                                    // 1. CALCULATE FINAL RESULTS
                                    // Read Redis hash before deleting
                                    const allAnswers = await redis.hgetall(answersKey);
                                    const totalResponses = Object.keys(allAnswers).length;
                                    
                                    // Initialize all option keys with 0
                                    const counts = {};
                                    liveQuestion.options.forEach(opt => {
                                        counts[opt.key] = 0;
                                    });
                                    
                                    // Count actual answers
                                    Object.values(allAnswers).forEach(answerKey => {
                                        if (counts.hasOwnProperty(answerKey)) {
                                            counts[answerKey] = (counts[answerKey] || 0) + 1;
                                        }
                                    });
                                    
                                    // 2. SAVE RESULTS TO MONGODB
                                    // FIX 1: PREVENT DOUBLE CLOSE (IDEMPOTENCY)
                                    // Only update if status is NOT already 'CLOSED'
                                    try {
                                        const updateResult = await ConferenceQuestion.findOneAndUpdate(
                                            {
                                                _id: liveQuestion.questionId,
                                                conferenceId: conferenceId,
                                                status: { $ne: 'CLOSED' } // FIX 1: Only update if not already CLOSED
                                            },
                                            {
                                                $set: {
                                                    status: 'CLOSED',
                                                    results: {
                                                        counts,
                                                        totalResponses,
                                                        closedAt
                                                    }
                                                }
                                            },
                                            { new: true }
                                        );
                                        
                                        // FIX 1: If no document was updated (already CLOSED), skip everything
                                        if (!updateResult) {
                                            console.log(`ℹ️  Question ${liveQuestion.questionId} already closed, skipping duplicate close`);
                                            questionTimers.delete(conferenceId);
                                            return;
                                        }
                                        
                                        console.log(`💾 Saved final results for question ${liveQuestion.questionId} to MongoDB`);
                                        
                                    } catch (mongoError) {
                                        console.error('MongoDB error saving results:', mongoError);
                                        // If MongoDB save fails, do NOT delete Redis keys
                                        // This allows retry or manual recovery
                                        questionTimers.delete(conferenceId);
                                        return;
                                    }
                                    
                                    // FIX 2: EMIT EVENTS IN CORRECT ORDER
                                    // 1️⃣ Emit question:closed first
                                    io.to(`conference:${conferenceId}`).emit('question:closed', {
                                        conferenceId,
                                        questionId: liveQuestion.questionId,
                                        closedAt
                                    });
                                    
                                    // 2️⃣ Emit question:results second
                                    io.to(`conference:${conferenceId}`).emit('question:results', {
                                        conferenceId,
                                        questionId: liveQuestion.questionId,
                                        counts,
                                        totalResponses,
                                        closedAt
                                    });
                                    
                                    // 4. REDIS CLEANUP (after MongoDB save and event emit)
                                    // Delete the Redis keys
                                    await redis.del(liveQuestionKey);
                                    await redis.del(answersKey);
                                    
                                    console.log(`⏰ Auto-closed question ${liveQuestion.questionId} for conference ${conferenceId}`);
                                    
                                    // Clear timer from Map after execution
                                    questionTimers.delete(conferenceId);
                                    
                                } catch (error) {
                                    console.error('Timer error during auto-close:', error);
                                    // Clear timer from Map even on error
                                    questionTimers.delete(conferenceId);
                                }
                            }, timerDuration);
                            
                            // Store timer ID in Map to prevent duplicates
                            questionTimers.set(conferenceId, timeoutId);
                            console.log(`⏰ Started auto-close timer for conference ${conferenceId} (${Math.round(timerDuration / 1000)}s)`);
                        } else {
                            console.log(`⚠️  Question ${questionId} has already expired, skipping timer`);
                        }

                        // Emit confirmation to HOST
                        socket.emit('question:pushed', {
                            conferenceId,
                            questionId: question._id.toString(),
                            startedAt,
                            expiresAt
                        });

                    } catch (error) {
                        console.error('Redis error pushing question live:', error);
                        socket.emit('error', {
                            code: 'INTERNAL_ERROR',
                            message: 'Failed to push question live'
                        });
                    }
                } else {
                    // Fallback if Redis not available
                    return socket.emit('error', {
                        code: 'REDIS_UNAVAILABLE',
                        message: 'Redis is required for live questions'
                    });
                }

            } catch (error) {
                console.error('Question push live error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to push question live'
                });
            }
        });

        /**
         * STEP 4: Handle answer:submit
         * Client emits: { conferenceId: string, questionId: string, optionKey: string }
         * Only AUDIENCE users can submit answers
         */
        socket.on('answer:submit', async (data) => {
            try {
                const { conferenceId, questionId, optionKey } = data;

                // Validate input
                if (!conferenceId || typeof conferenceId !== 'string') {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Conference ID is required'
                    });
                }

                if (!questionId || typeof questionId !== 'string') {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Question ID is required'
                    });
                }

                if (!optionKey || typeof optionKey !== 'string') {
                    return socket.emit('error', {
                        code: 'INVALID_REQUEST',
                        message: 'Option key is required'
                    });
                }

                // Requirement 1: Only AUDIENCE users can submit answers
                // Check if user is HOST (HOST and SPEAKER must be rejected)
                let isHost = false;
                if (redis) {
                    try {
                        const hostId = await redis.get(`conference:${conferenceId}:host`);
                        isHost = hostId === userId;
                    } catch (error) {
                        console.error('Redis error reading host:', error);
                        return socket.emit('error', {
                            code: 'INTERNAL_ERROR',
                            message: 'Failed to verify user role'
                        });
                    }
                }

                if (isHost) {
                    return socket.emit('error', {
                        code: 'UNAUTHORIZED',
                        message: 'Only AUDIENCE can submit answers'
                    });
                }

                // Requirement 2: A live question MUST exist
                if (!redis) {
                    return socket.emit('error', {
                        code: 'REDIS_UNAVAILABLE',
                        message: 'Redis is required for answer submission'
                    });
                }

                const liveQuestionKey = `conference:${conferenceId}:live_question`;
                const liveQuestionData = await redis.get(liveQuestionKey);

                if (!liveQuestionData) {
                    return socket.emit('error', {
                        code: 'QUESTION_NOT_LIVE',
                        message: 'No live question found for this conference'
                    });
                }

                // Parse live question data
                const liveQuestion = JSON.parse(liveQuestionData);

                // Verify questionId matches
                if (liveQuestion.questionId !== questionId) {
                    return socket.emit('error', {
                        code: 'QUESTION_NOT_LIVE',
                        message: 'The submitted question is not the current live question'
                    });
                }

                // Requirement 3: Question must NOT be expired
                const now = Date.now();
                if (now > liveQuestion.expiresAt) {
                    return socket.emit('error', {
                        code: 'QUESTION_EXPIRED',
                        message: 'The question has expired'
                    });
                }

                // Requirement 4: User can submit ONLY ONCE per question
                // Use Redis hash: conference:{conferenceId}:answers:{questionId}
                // Key = userId, Value = optionKey
                const answersKey = `conference:${conferenceId}:answers:${questionId}`;
                
                // Use HSETNX (atomic) - returns 1 if field was set, 0 if field already exists
                const setResult = await redis.hsetnx(answersKey, userId, optionKey);

                if (setResult === 0) {
                    // Field already exists - user already answered
                    return socket.emit('error', {
                        code: 'ALREADY_ANSWERED',
                        message: 'You have already submitted an answer for this question'
                    });
                }

                // Requirement 5: Answer stored in Redis (NO MongoDB writes)
                // Answer is already stored by HSETNX above

                // Requirement 6: Emit answer:submitted to submitting socket
                socket.emit('answer:submitted', {
                    conferenceId,
                    questionId,
                    optionKey
                });

                console.log(`✅ User ${userId} submitted answer ${optionKey} for question ${questionId}`);

                // Requirement 7: Emit updated live stats to HOST only
                // Calculate stats from Redis hash at runtime
                try {
                    const allAnswers = await redis.hgetall(answersKey);
                    const totalResponses = Object.keys(allAnswers).length;

                    // Count answers by option key
                    const counts = {};
                    // Initialize all options from live question
                    liveQuestion.options.forEach(opt => {
                        counts[opt.key] = 0;
                    });

                    // Count actual answers
                    Object.values(allAnswers).forEach(answerKey => {
                        if (counts.hasOwnProperty(answerKey)) {
                            counts[answerKey] = (counts[answerKey] || 0) + 1;
                        }
                    });

                    // Emit answer:stats to HOST only (in host room)
                    io.to(`host:${conferenceId}`).emit('answer:stats', {
                        conferenceId,
                        questionId,
                        counts,
                        totalResponses
                    });

                    console.log(`📊 Updated stats for question ${questionId}: ${totalResponses} responses`);

                } catch (error) {
                    console.error('Error calculating stats:', error);
                    // Don't fail the answer submission if stats calculation fails
                }

            } catch (error) {
                console.error('Answer submit error:', error);
                socket.emit('error', {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to submit answer'
                });
            }
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`❌ User disconnected: ${userId}`);
            
            // Remove from online status and set last seen
            await setUserOffline(userId);
            socket.broadcast.emit('user:offline', { userId });

            // ============================================
            // CONFERENCE DISCONNECT CLEANUP
            // ============================================
            
            if (redis) {
                try {
                    // 1. Read all conferences user joined
                    const conferenceIds = await redis.smembers(`user:${userId}:conferences`);
                    
                    if (conferenceIds && conferenceIds.length > 0) {
                        // 2. For EACH conferenceId, remove user and broadcast count
                        // FIX #4: Skip conferences that were explicitly left to avoid reprocessing
                        for (const conferenceId of conferenceIds) {
                            // Skip if already explicitly left (handled by conference:leave handler)
                            if (explicitlyLeftConferences.has(conferenceId)) {
                                console.log(`⏭️  Skipping cleanup for explicitly left conference ${conferenceId}`);
                                continue;
                            }
                            
                            try {
                                // Remove from SET conference:{conferenceId}:audience
                                await redis.srem(`conference:${conferenceId}:audience`, userId);
                                
                                // Recalculate audience count
                                let audienceCount = await redis.scard(`conference:${conferenceId}:audience`);
                                if (audienceCount < 0) {
                                    audienceCount = 0;
                                }
                                
                                // Broadcast updated count to room
                                io.to(`conference:${conferenceId}`).emit('audience:count', {
                                    conferenceId,
                                    audienceCount
                                });
                                
                                console.log(`🧹 Cleaned up user ${userId} from conference ${conferenceId}, audience: ${audienceCount}`);
                            } catch (error) {
                                console.error(`Error cleaning up conference ${conferenceId}:`, error);
                            }
                        }
                        
                        // 3. Cleanup: Delete user:{userId}:conferences
                        await redis.del(`user:${userId}:conferences`);
                    }
                } catch (error) {
                    console.error('Redis error during disconnect cleanup:', error);
                }
            }
        });
    });

    // FIX #6: Temporarily disable initConferenceHandlers(io)
    // Initialize conference polling handlers
    // initConferenceHandlers(io);
    // console.log('✅ Conference polling handlers initialized');

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized. Call initSocketServer first.');
    }
    return io;
};

module.exports = {
    initSocketServer,
    getIO
};

/* ============================================
   MANUAL TEST INSTRUCTIONS
   ============================================
   
   Testing Conference Join/Leave with 2 Users
   ============================================
   
   Prerequisites:
   - Server running with Redis configured (or fallback will work)
   - Two JWT tokens: one for HOST, one for AUDIENCE
   - Conference created with hostId set in Redis: conference:{conferenceId}:host
   
   Step 1: Set up Redis host key (if testing with Redis)
   --------------------------------------------
   In Redis CLI or via code:
   SET conference:YOUR_CONFERENCE_ID:host YOUR_HOST_USER_ID
   
   Step 2: Connect User 1 (HOST)
   --------------------------------------------
   const socket1 = io('http://localhost:PORT', {
     auth: { token: 'HOST_JWT_TOKEN' }
   });
   
   socket1.on('connect', () => {
     console.log('HOST connected');
     
     // Join conference
     socket1.emit('conference:join', {
       conferenceId: 'YOUR_CONFERENCE_ID'
     });
   });
   
   socket1.on('conference:joined', (data) => {
     console.log('HOST joined:', data);
     // Expected: { conferenceId, role: 'HOST', audienceCount: 1 }
   });
   
   socket1.on('audience:count', (data) => {
     console.log('Audience count update:', data);
     // Expected: { conferenceId, audienceCount: 1 or 2 }
   });
   
   Step 3: Connect User 2 (AUDIENCE)
   --------------------------------------------
   const socket2 = io('http://localhost:PORT', {
     auth: { token: 'AUDIENCE_JWT_TOKEN' }
   });
   
   socket2.on('connect', () => {
     console.log('AUDIENCE connected');
     
     // Join conference
     socket2.emit('conference:join', {
       conferenceId: 'YOUR_CONFERENCE_ID'
     });
   });
   
   socket2.on('conference:joined', (data) => {
     console.log('AUDIENCE joined:', data);
     // Expected: { conferenceId, role: 'AUDIENCE', audienceCount: 2 }
   });
   
   socket2.on('audience:count', (data) => {
     console.log('Audience count update:', data);
   });
   
   Step 4: Test Leave
   --------------------------------------------
   // User 2 leaves
   socket2.emit('conference:leave', {
     conferenceId: 'YOUR_CONFERENCE_ID'
   });
   
   socket2.on('conference:left', (data) => {
     console.log('AUDIENCE left:', data);
     // Expected: { conferenceId }
   });
   
   // Both users should receive audience:count with count = 1
   
   Step 5: Test Disconnect Cleanup
   --------------------------------------------
   // Disconnect User 1
   socket1.disconnect();
   
   // User 2 should receive audience:count with count = 0
   // (if User 1 was the only remaining member)
   
   Expected Console Logs:
   --------------------------------------------
   📥 User USER_ID joined conference CONFERENCE_ID
   ✅ User USER_ID (HOST) joined conference CONFERENCE_ID, audience: 1
   📥 User USER_ID joined conference CONFERENCE_ID
   ✅ User USER_ID (AUDIENCE) joined conference CONFERENCE_ID, audience: 2
   📤 User USER_ID left conference CONFERENCE_ID
   ✅ User USER_ID left conference CONFERENCE_ID, audience: 1
   ❌ User disconnected: USER_ID
   🧹 Cleaned up user USER_ID from conference CONFERENCE_ID, audience: 0
   
   Verification Checklist:
   --------------------------------------------
   ✅ HOST receives role: 'HOST' in conference:joined
   ✅ AUDIENCE receives role: 'AUDIENCE' in conference:joined
   ✅ Both users receive audience:count updates
   ✅ Audience count increments on join
   ✅ Audience count decrements on leave
   ✅ Audience count never goes negative
   ✅ Disconnect properly cleans up presence
   ✅ No duplicate presence entries
   ✅ Redis keys are created/updated correctly
   
   Redis Keys to Verify (if Redis enabled):
   --------------------------------------------
   - SET conference:{conferenceId}:audience contains user IDs
   - SET user:{userId}:conferences contains conference IDs
   - Key conference:{conferenceId}:host contains host user ID
   
   ============================================
   
   Testing STEP 2: Host Push Live Question
   ============================================
   
   Prerequisites:
   - Server running with Redis configured
   - HOST user connected and joined conference
   - Conference created with hostId set in Redis: conference:{conferenceId}:host
   - Question created in MongoDB for the conference
   
   Step 1: Set up Redis host key
   --------------------------------------------
   In Redis CLI or via code:
   SET conference:YOUR_CONFERENCE_ID:host YOUR_HOST_USER_ID
   
   Step 2: Create a question in MongoDB
   --------------------------------------------
   Use your API or MongoDB client to create a ConferenceQuestion:
   {
     conferenceId: ObjectId('YOUR_CONFERENCE_ID'),
     order: 1,
     questionText: "What is 2 + 2?",
     options: [
       { key: "A", text: "3" },
       { key: "B", text: "4" },
       { key: "C", text: "5" },
       { key: "D", text: "6" }
     ],
     correctOption: "B",
     createdByRole: "HOST",
     createdById: ObjectId('YOUR_HOST_USER_ID'),
     createdByModel: "User"
   }
   
   Step 3: Connect HOST user and join conference
   --------------------------------------------
   const socketHost = io('http://localhost:PORT', {
     auth: { token: 'HOST_JWT_TOKEN' }
   });
   
   socketHost.on('connect', () => {
     console.log('HOST connected');
     
     // Join conference first
     socketHost.emit('conference:join', {
       conferenceId: 'YOUR_CONFERENCE_ID'
     });
   });
   
   socketHost.on('conference:joined', (data) => {
     console.log('HOST joined:', data);
     // Expected: { conferenceId, role: 'HOST', audienceCount: 1 }
   });
   
   Step 4: Connect AUDIENCE user and join conference
   --------------------------------------------
   const socketAudience = io('http://localhost:PORT', {
     auth: { token: 'AUDIENCE_JWT_TOKEN' }
   });
   
   socketAudience.on('connect', () => {
     console.log('AUDIENCE connected');
     
     // Join conference
     socketAudience.emit('conference:join', {
       conferenceId: 'YOUR_CONFERENCE_ID'
     });
   });
   
   socketAudience.on('conference:joined', (data) => {
     console.log('AUDIENCE joined:', data);
   });
   
   // Listen for live question event
   socketAudience.on('question:live', (data) => {
     console.log('AUDIENCE received question:live:', data);
     // Expected: { conferenceId, questionId, questionText, options[], startedAt, expiresAt }
   });
   
   Step 5: HOST pushes question live
   --------------------------------------------
   socketHost.on('conference:joined', () => {
     // Wait for join confirmation, then push question
     socketHost.emit('question:push_live', {
       conferenceId: 'YOUR_CONFERENCE_ID',
       questionId: 'YOUR_QUESTION_ID',
       duration: 45  // Optional, defaults to 45 seconds
     });
   });
   
   socketHost.on('question:pushed', (data) => {
     console.log('HOST confirmation:', data);
     // Expected: { conferenceId, questionId, startedAt, expiresAt }
   });
   
   socketHost.on('error', (error) => {
     console.error('HOST error:', error);
   });
   
   Step 6: Verify both users receive question:live
   --------------------------------------------
   - HOST should receive question:pushed confirmation
   - Both HOST and AUDIENCE should receive question:live broadcast
   - Check console logs for question:live event
   
   Step 7: Test duplicate question push (same question)
   --------------------------------------------
   // Push the same question again (should be idempotent)
   socketHost.emit('question:push_live', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID'
   });
   
   // Should re-broadcast without error
   
   Step 8: Test pushing different question while one is live
   --------------------------------------------
   // Create another question
   // Try to push it while first question is live
   socketHost.emit('question:push_live', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'ANOTHER_QUESTION_ID'
   });
   
   // Should receive error: QUESTION_ALREADY_LIVE
   socketHost.on('error', (error) => {
     if (error.code === 'QUESTION_ALREADY_LIVE') {
       console.log('✅ Correctly prevented duplicate live question');
     }
   });
   
   Step 9: Test AUDIENCE trying to push question (should fail)
   --------------------------------------------
   socketAudience.emit('question:push_live', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID'
   });
   
   socketAudience.on('error', (error) => {
     if (error.code === 'UNAUTHORIZED') {
       console.log('✅ Correctly prevented AUDIENCE from pushing questions');
     }
   });
   
   Expected Console Logs:
   --------------------------------------------
   ✅ HOST USER_ID pushed question QUESTION_ID live for conference CONFERENCE_ID (expires in 45s)
   
   Redis Keys to Verify:
   --------------------------------------------
   - Key conference:{conferenceId}:live_question contains JSON:
     {
       conferenceId: "...",
       questionId: "...",
       questionText: "...",
       options: [...],
       startedAt: 1234567890,
       expiresAt: 1234567890,
       duration: 45
     }
   
   Verification Checklist:
   --------------------------------------------
   ✅ Only HOST can push questions live
   ✅ AUDIENCE receives question:live broadcast
   ✅ HOST receives question:pushed confirmation
   ✅ Only one question can be live at a time
   ✅ Pushing same question again is idempotent
   ✅ Pushing different question while one is live fails
   ✅ Question data includes all required fields
   ✅ expiresAt is calculated correctly (startedAt + duration)
   
   ============================================
   
   Testing STEP 3: Server-side Timer and Auto-close
   ============================================
   
   Prerequisites:
   - Server running with Redis configured
   - HOST user connected and joined conference
   - AUDIENCE user connected and joined conference
   - Conference created with hostId set in Redis
   - Question created in MongoDB
   
   Step 1: Set up Redis host key
   --------------------------------------------
   SET conference:YOUR_CONFERENCE_ID:host YOUR_HOST_USER_ID
   
   Step 2: Connect HOST and AUDIENCE users
   --------------------------------------------
   const socketHost = io('http://localhost:PORT', {
     auth: { token: 'HOST_JWT_TOKEN' }
   });
   
   const socketAudience = io('http://localhost:PORT', {
     auth: { token: 'AUDIENCE_JWT_TOKEN' }
   });
   
   // Both users join conference
   socketHost.emit('conference:join', { conferenceId: 'YOUR_CONFERENCE_ID' });
   socketAudience.emit('conference:join', { conferenceId: 'YOUR_CONFERENCE_ID' });
   
   Step 3: Listen for question:closed event
   --------------------------------------------
   socketHost.on('question:closed', (data) => {
     console.log('HOST received question:closed:', data);
     // Expected: { conferenceId, questionId, closedAt }
   });
   
   socketAudience.on('question:closed', (data) => {
     console.log('AUDIENCE received question:closed:', data);
     // Expected: { conferenceId, questionId, closedAt }
   });
   
   Step 4: HOST pushes question with short duration (for testing)
   --------------------------------------------
   socketHost.emit('question:push_live', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     duration: 10  // 10 seconds for quick testing
   });
   
   Step 5: Verify timer started
   --------------------------------------------
   Check server console logs:
   - Should see: "⏰ Started auto-close timer for conference {conferenceId} (10s)"
   - Timer Map should contain the conferenceId
   
   Step 6: Wait for auto-close (10 seconds)
   --------------------------------------------
   - Wait 10 seconds (or duration specified)
   - Both HOST and AUDIENCE should receive question:closed event
   - Check server console: "⏰ Auto-closed question {questionId} for conference {conferenceId}"
   
   Step 7: Verify Redis key deleted
   --------------------------------------------
   In Redis CLI:
   GET conference:YOUR_CONFERENCE_ID:live_question
   - Should return nil (key deleted)
   
   Step 8: Test duplicate timer prevention
   --------------------------------------------
   // Push same question again before timer fires
   socketHost.emit('question:push_live', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     duration: 15
   });
   
   Check server console:
   - Should see: "⏰ Cleared existing timer for conference {conferenceId}"
   - Should see: "⏰ Started auto-close timer for conference {conferenceId} (15s)"
   - Only ONE timer should be active
   
   Step 9: Test manual close before timer fires
   --------------------------------------------
   // Manually delete Redis key before timer fires
   // In Redis CLI: DEL conference:YOUR_CONFERENCE_ID:live_question
   
   // Wait for timer to fire
   // Check server console:
   - Should see: "ℹ️  Question for conference {conferenceId} already closed, timer cleanup only"
   - Should NOT emit question:closed (key already deleted)
   
   Step 10: Test expired question (negative duration)
   --------------------------------------------
   // Push question with past expiresAt (simulate expired)
   // This should skip timer creation
   
   Check server console:
   - Should see: "⚠️  Question {questionId} has already expired, skipping timer"
   
   Expected Console Logs:
   --------------------------------------------
   ⏰ Started auto-close timer for conference CONFERENCE_ID (10s)
   ⏰ Auto-closed question QUESTION_ID for conference CONFERENCE_ID
   
   Or if manually closed:
   ℹ️  Question for conference CONFERENCE_ID already closed, timer cleanup only
   
   Verification Checklist:
   --------------------------------------------
   ✅ Timer starts when question is pushed live
   ✅ Timer duration = expiresAt - Date.now()
   ✅ Only ONE timer per conference (duplicates prevented)
   ✅ Timer fires after duration expires
   ✅ question:closed emitted to conference room
   ✅ Redis key deleted when timer fires
   ✅ If key already deleted, no question:closed emitted
   ✅ Timer cleared from Map after execution
   ✅ Duplicate timer prevention works
   ✅ Expired questions skip timer creation
   
   Redis Keys to Verify:
   --------------------------------------------
   - Before timer fires: conference:{conferenceId}:live_question exists
   - After timer fires: conference:{conferenceId}:live_question does NOT exist (deleted)
   
   ============================================
   
   MANUAL TEST – STEP 4: Answer Submission Logic
   ============================================
   
   Prerequisites:
   - Server running with Redis configured
   - HOST user connected and joined conference
   - 2 AUDIENCE users connected and joined conference
   - Conference created with hostId set in Redis
   - Question created in MongoDB and pushed live
   
   Step 1: Set up Redis host key
   --------------------------------------------
   SET conference:YOUR_CONFERENCE_ID:host YOUR_HOST_USER_ID
   
   Step 2: Connect HOST and 2 AUDIENCE users
   --------------------------------------------
   const socketHost = io('http://localhost:PORT', {
     auth: { token: 'HOST_JWT_TOKEN' }
   });
   
   const socketAudience1 = io('http://localhost:PORT', {
     auth: { token: 'AUDIENCE1_JWT_TOKEN' }
   });
   
   const socketAudience2 = io('http://localhost:PORT', {
     auth: { token: 'AUDIENCE2_JWT_TOKEN' }
   });
   
   // All users join conference
   socketHost.emit('conference:join', { conferenceId: 'YOUR_CONFERENCE_ID' });
   socketAudience1.emit('conference:join', { conferenceId: 'YOUR_CONFERENCE_ID' });
   socketAudience2.emit('conference:join', { conferenceId: 'YOUR_CONFERENCE_ID' });
   
   Step 3: HOST pushes question live
   --------------------------------------------
   socketHost.emit('question:push_live', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     duration: 60  // 60 seconds for testing
   });
   
   Step 4: Listen for answer events
   --------------------------------------------
   // AUDIENCE users listen for confirmation
   socketAudience1.on('answer:submitted', (data) => {
     console.log('AUDIENCE1 answer submitted:', data);
     // Expected: { conferenceId, questionId, optionKey }
   });
   
   socketAudience2.on('answer:submitted', (data) => {
     console.log('AUDIENCE2 answer submitted:', data);
   });
   
   // HOST listens for stats
   socketHost.on('answer:stats', (data) => {
     console.log('HOST received stats:', data);
     // Expected: { conferenceId, questionId, counts: {A: 0, B: 1, ...}, totalResponses: 1 }
   });
   
   Step 5: AUDIENCE1 submits answer
   --------------------------------------------
   socketAudience1.emit('answer:submit', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     optionKey: 'A'
   });
   
   Verify:
   - AUDIENCE1 receives answer:submitted
   - HOST receives answer:stats with totalResponses: 1, counts.A: 1
   - AUDIENCE2 does NOT receive any answer events
   
   Step 6: AUDIENCE2 submits answer
   --------------------------------------------
   socketAudience2.emit('answer:submit', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     optionKey: 'B'
   });
   
   Verify:
   - AUDIENCE2 receives answer:submitted
   - HOST receives answer:stats with totalResponses: 2, counts.A: 1, counts.B: 1
   
   Step 7: Test duplicate submission (AUDIENCE1 tries again)
   --------------------------------------------
   socketAudience1.emit('answer:submit', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     optionKey: 'C'  // Different option
   });
   
   socketAudience1.on('error', (error) => {
     if (error.code === 'ALREADY_ANSWERED') {
       console.log('✅ Correctly prevented duplicate answer');
     }
   });
   
   Verify:
   - AUDIENCE1 receives error: ALREADY_ANSWERED
   - HOST does NOT receive updated stats
   - Redis hash still has only 2 entries
   
   Step 8: Test HOST trying to submit answer (should fail)
   --------------------------------------------
   socketHost.emit('answer:submit', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     optionKey: 'A'
   });
   
   socketHost.on('error', (error) => {
     if (error.code === 'UNAUTHORIZED') {
       console.log('✅ Correctly prevented HOST from submitting answer');
     }
   });
   
   Step 9: Test late submission (after question expires)
   --------------------------------------------
   // Wait for question to expire (or manually delete live_question key)
   // In Redis CLI: DEL conference:YOUR_CONFERENCE_ID:live_question
   
   socketAudience2.emit('answer:submit', {
     conferenceId: 'YOUR_CONFERENCE_ID',
     questionId: 'YOUR_QUESTION_ID',
     optionKey: 'D'
   });
   
   socketAudience2.on('error', (error) => {
     if (error.code === 'QUESTION_NOT_LIVE' || error.code === 'QUESTION_EXPIRED') {
       console.log('✅ Correctly prevented late submission');
     }
   });
   
   Step 10: Host stats verification
   --------------------------------------------
   // Check Redis hash directly
   // In Redis CLI:
   HGETALL conference:YOUR_CONFERENCE_ID:answers:YOUR_QUESTION_ID
   
   Expected output:
   - userId1: "A"
   - userId2: "B"
   
   // Verify stats calculation
   - Count A: 1
   - Count B: 1
   - Count C: 0
   - Count D: 0
   - Total: 2
   
   Expected Console Logs:
   --------------------------------------------
   ✅ User USER_ID submitted answer A for question QUESTION_ID
   📊 Updated stats for question QUESTION_ID: 1 responses
   ✅ User USER_ID submitted answer B for question QUESTION_ID
   📊 Updated stats for question QUESTION_ID: 2 responses
   
   Verification Checklist:
   --------------------------------------------
   ✅ Only AUDIENCE can submit answers
   ✅ HOST cannot submit answers (UNAUTHORIZED)
   ✅ Live question must exist (QUESTION_NOT_LIVE)
   ✅ Question must not be expired (QUESTION_EXPIRED)
   ✅ User can only submit once (ALREADY_ANSWERED)
   ✅ Answer stored in Redis hash
   ✅ answer:submitted emitted to submitting socket
   ✅ answer:stats emitted to HOST only
   ✅ Stats calculated correctly from Redis
   ✅ Duplicate submission prevented
   ✅ Late submission prevented
   ✅ No MongoDB writes
   ✅ No events broadcast to AUDIENCE
   
   Redis Keys to Verify:
   --------------------------------------------
   - conference:{conferenceId}:live_question (must exist)
   - conference:{conferenceId}:answers:{questionId} (HASH)
     - userId1 → optionKey1
     - userId2 → optionKey2
   
   ============================================ */
