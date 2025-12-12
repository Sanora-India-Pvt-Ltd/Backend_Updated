const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { setUserOnline, setUserOffline, isUserOnline } = require('../config/redis');
const { initRedis, getRedisSubscriber, getRedisPublisher } = require('../config/redis');

let io = null;

const initSocketServer = async (httpServer) => {
    // Initialize Redis first and wait for connections
    await initRedis();
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

    // Use Redis adapter for scaling (if Redis is available)
    // CRITICAL: Only initialize adapter AFTER Redis connections are established and ready
    // Socket.IO adapter calls psubscribe() immediately, which requires an open connection
    // initRedis() now waits for connections to be ready before returning
    if (redisSubscriber && redisPublisher) {
        try {
            // Verify connections are ready (should be ready after await initRedis())
            const subscriberStatus = redisSubscriber.status;
            const publisherStatus = redisPublisher.status;
            
            if (subscriberStatus === 'ready' && publisherStatus === 'ready') {
                const { createAdapter } = require('@socket.io/redis-adapter');
                io.adapter(createAdapter(redisPublisher, redisSubscriber));
                console.log('✅ Socket.IO Redis adapter initialized');
            } else {
                console.warn('⚠️  Redis connections not ready - using in-memory adapter');
                console.warn(`   Subscriber status: ${subscriberStatus}, Publisher status: ${publisherStatus}`);
                console.warn('   This may happen if Redis is not available or connection failed');
            }
        } catch (error) {
            console.warn('⚠️  Redis adapter not available, using in-memory adapter');
            console.warn('   Error:', error.message);
        }
    } else {
        console.log('ℹ️  Redis not configured - using in-memory adapter (single server only)');
    }

    // Socket authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
            
            if (!token) {
                return next(new Error('Authentication error: Token required'));
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                const user = await User.findById(decoded.id).select('-password');
                
                if (!user) {
                    return next(new Error('Authentication error: User not found'));
                }

                socket.userId = user._id.toString();
                socket.user = user;
                next();
            } catch (error) {
                return next(new Error('Authentication error: Invalid token'));
            }
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    // Connection handling
    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`✅ User connected: ${userId}`);

        // Set user online
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
                await message.populate('senderId', 'firstName lastName name profileImage');
                if (message.replyTo) {
                    await message.populate('replyTo');
                }

                // Update conversation last message
                conversation.lastMessage = message._id;
                conversation.lastMessageAt = new Date();
                await conversation.save();

                // Emit to all participants in the conversation
                io.to(`conversation:${conversationId}`).emit('new:message', {
                    message: message.toObject()
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

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`❌ User disconnected: ${userId}`);
            await setUserOffline(userId);
            socket.broadcast.emit('user:offline', { userId });
        });
    });

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

