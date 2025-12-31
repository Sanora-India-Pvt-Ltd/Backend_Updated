/**
 * Conference Polling Service
 * Handles Redis operations for live conference polling
 * Falls back to in-memory storage if Redis not available
 */

const Conference = require('../models/conference/Conference');
const ConferenceQuestion = require('../models/conference/ConferenceQuestion');
const { getRedis, isRedisReady } = require('../config/redisConnection');

// In-memory fallback storage
const inMemoryStorage = {
    conferenceStatus: new Map(), // conferenceId -> status
    liveQuestions: new Map(), // conferenceId -> { questionId, startedAt, expiresAt, duration }
    questionTimers: new Map(), // questionId -> { startedAt, expiresAt, duration }
    voteCounts: new Map(), // questionId -> { total: number, [option]: number }
    userVotes: new Map(), // questionId -> Set of userIds
    correctCounts: new Map(), // questionId -> number
    audience: new Map(), // conferenceId -> Set of userIds
    conferenceHosts: new Map(), // conferenceId -> hostId
    questionMeta: new Map() // questionId -> { conferenceId, questionText, options, correctOption }
};

// Timer intervals for countdown (in-memory fallback)
const timerIntervals = new Map(); // questionId -> intervalId

/**
 * Get Redis client or return null
 */
const getRedisClient = () => {
    if (isRedisReady()) {
        return getRedis();
    }
    return null;
};

/**
 * Conference Status Operations
 */
const conferenceService = {
    /**
     * Set conference status
     */
    async setStatus(conferenceId, status) {
        const redis = getRedisClient();
        if (redis) {
            await redis.set(`conference:${conferenceId}:status`, status);
        } else {
            inMemoryStorage.conferenceStatus.set(conferenceId, status);
        }
    },

    /**
     * Get conference status
     */
    async getStatus(conferenceId) {
        const redis = getRedisClient();
        if (redis) {
            return await redis.get(`conference:${conferenceId}:status`);
        } else {
            return inMemoryStorage.conferenceStatus.get(conferenceId) || null;
        }
    },

    /**
     * Set conference host
     */
    async setHost(conferenceId, hostId) {
        const redis = getRedisClient();
        if (redis) {
            await redis.set(`conference:${conferenceId}:host`, hostId);
        } else {
            inMemoryStorage.conferenceHosts.set(conferenceId, hostId);
        }
    },

    /**
     * Get conference host
     */
    async getHost(conferenceId) {
        const redis = getRedisClient();
        if (redis) {
            return await redis.get(`conference:${conferenceId}:host`);
        } else {
            return inMemoryStorage.conferenceHosts.get(conferenceId) || null;
        }
    }
};

/**
 * Question Lifecycle Operations
 */
const questionService = {
    /**
     * Set question as live
     */
    async setLive(conferenceId, questionId, duration = 45) {
        const redis = getRedisClient();
        const startedAt = Date.now();
        const expiresAt = startedAt + (duration * 1000);

        if (redis) {
            // Set live question hash
            await redis.hset(`conference:${conferenceId}:live_question`, {
                questionId,
                startedAt: startedAt.toString(),
                expiresAt: expiresAt.toString(),
                duration: duration.toString()
            });
            // Set TTL to auto-expire
            await redis.expire(`conference:${conferenceId}:live_question`, duration);

            // Set timer hash
            await redis.hset(`question:${questionId}:timer`, {
                startedAt: startedAt.toString(),
                expiresAt: expiresAt.toString(),
                duration: duration.toString()
            });
            await redis.expire(`question:${questionId}:timer`, duration);
        } else {
            inMemoryStorage.liveQuestions.set(conferenceId, {
                questionId,
                startedAt,
                expiresAt,
                duration
            });
            inMemoryStorage.questionTimers.set(questionId, {
                startedAt,
                expiresAt,
                duration
            });
        }
    },

    /**
     * Get live question for conference
     */
    async getLive(conferenceId) {
        const redis = getRedisClient();
        if (redis) {
            const data = await redis.hgetall(`conference:${conferenceId}:live_question`);
            if (!data || !data.questionId) return null;
            return {
                questionId: data.questionId,
                startedAt: parseInt(data.startedAt),
                expiresAt: parseInt(data.expiresAt),
                duration: parseInt(data.duration)
            };
        } else {
            return inMemoryStorage.liveQuestions.get(conferenceId) || null;
        }
    },

    /**
     * Close live question
     */
    async closeLive(conferenceId) {
        const redis = getRedisClient();
        if (redis) {
            const liveQuestion = await this.getLive(conferenceId);
            if (liveQuestion) {
                await redis.del(`conference:${conferenceId}:live_question`);
                await redis.del(`question:${liveQuestion.questionId}:timer`);
            }
        } else {
            const liveQuestion = inMemoryStorage.liveQuestions.get(conferenceId);
            if (liveQuestion) {
                inMemoryStorage.liveQuestions.delete(conferenceId);
                inMemoryStorage.questionTimers.delete(liveQuestion.questionId);
                // Clear timer interval if exists
                const intervalId = timerIntervals.get(liveQuestion.questionId);
                if (intervalId) {
                    clearInterval(intervalId);
                    timerIntervals.delete(liveQuestion.questionId);
                }
            }
        }
    },

    /**
     * Cache question metadata
     */
    async cacheQuestionMeta(questionId, meta) {
        const redis = getRedisClient();
        if (redis) {
            await redis.hset(`question:${questionId}:meta`, {
                conferenceId: meta.conferenceId.toString(),
                questionText: meta.questionText,
                options: JSON.stringify(meta.options),
                correctOption: meta.correctOption,
                status: meta.status || 'ACTIVE'
            });
            await redis.expire(`question:${questionId}:meta`, 3600); // 1 hour
        } else {
            inMemoryStorage.questionMeta.set(questionId, meta);
        }
    },

    /**
     * Get cached question metadata
     */
    async getQuestionMeta(questionId) {
        const redis = getRedisClient();
        if (redis) {
            const data = await redis.hgetall(`question:${questionId}:meta`);
            if (!data || !data.questionText) return null;
            return {
                conferenceId: data.conferenceId,
                questionText: data.questionText,
                options: JSON.parse(data.options),
                correctOption: data.correctOption,
                status: data.status
            };
        } else {
            return inMemoryStorage.questionMeta.get(questionId) || null;
        }
    }
};

/**
 * Voting Operations
 */
const votingService = {
    /**
     * Initialize vote counts for a question
     */
    async initializeVotes(questionId, options) {
        const redis = getRedisClient();
        if (redis) {
            // Initialize hash with all options set to 0
            const counts = { total: '0' };
            options.forEach(opt => {
                counts[opt.key] = '0';
            });
            await redis.hset(`question:${questionId}:votes:counts`, counts);
            await redis.set(`question:${questionId}:votes:correct`, '0');
            await redis.expire(`question:${questionId}:votes:counts`, 3600);
            await redis.expire(`question:${questionId}:votes:correct`, 3600);
        } else {
            const counts = { total: 0 };
            options.forEach(opt => {
                counts[opt.key] = 0;
            });
            inMemoryStorage.voteCounts.set(questionId, counts);
            inMemoryStorage.correctCounts.set(questionId, 0);
            if (!inMemoryStorage.userVotes.has(questionId)) {
                inMemoryStorage.userVotes.set(questionId, new Set());
            }
        }
    },

    /**
     * Check if user has voted
     */
    async hasVoted(questionId, userId) {
        const redis = getRedisClient();
        if (redis) {
            const result = await redis.sismember(`question:${questionId}:votes:users`, userId);
            return result === 1;
        } else {
            const userSet = inMemoryStorage.userVotes.get(questionId);
            return userSet ? userSet.has(userId) : false;
        }
    },

    /**
     * Submit vote (atomic operation)
     */
    async submitVote(questionId, userId, selectedOption, isCorrect) {
        const redis = getRedisClient();
        if (redis) {
            // Use pipeline for atomic operations
            const pipeline = redis.pipeline();
            
            // Add user to voted set (returns 1 if new, 0 if duplicate)
            pipeline.sadd(`question:${questionId}:votes:users`, userId);
            
            // Increment counts atomically
            pipeline.hincrby(`question:${questionId}:votes:counts`, 'total', 1);
            pipeline.hincrby(`question:${questionId}:votes:counts`, selectedOption, 1);
            
            if (isCorrect) {
                pipeline.incr(`question:${questionId}:votes:correct`);
            }
            
            const results = await pipeline.exec();
            
            // Check if user was already in set (first operation result)
            const wasNewVote = results[0][1] === 1;
            
            if (!wasNewVote) {
                return { success: false, reason: 'duplicate' };
            }
            
            // Get updated counts
            const counts = await redis.hgetall(`question:${questionId}:votes:counts`);
            const totalVotes = parseInt(counts.total || '0');
            const optionCounts = {};
            Object.keys(counts).forEach(key => {
                if (key !== 'total') {
                    optionCounts[key] = parseInt(counts[key] || '0');
                }
            });
            
            return {
                success: true,
                totalVotes,
                optionCounts
            };
        } else {
            // In-memory fallback
            const userSet = inMemoryStorage.userVotes.get(questionId) || new Set();
            if (userSet.has(userId)) {
                return { success: false, reason: 'duplicate' };
            }
            
            userSet.add(userId);
            inMemoryStorage.userVotes.set(questionId, userSet);
            
            const counts = inMemoryStorage.voteCounts.get(questionId) || { total: 0 };
            counts.total = (counts.total || 0) + 1;
            counts[selectedOption] = (counts[selectedOption] || 0) + 1;
            inMemoryStorage.voteCounts.set(questionId, counts);
            
            if (isCorrect) {
                const correctCount = inMemoryStorage.correctCounts.get(questionId) || 0;
                inMemoryStorage.correctCounts.set(questionId, correctCount + 1);
            }
            
            return {
                success: true,
                totalVotes: counts.total,
                optionCounts: Object.fromEntries(
                    Object.entries(counts).filter(([key]) => key !== 'total')
                )
            };
        }
    },

    /**
     * Get current vote counts
     */
    async getVoteCounts(questionId) {
        const redis = getRedisClient();
        if (redis) {
            const counts = await redis.hgetall(`question:${questionId}:votes:counts`);
            if (!counts || !counts.total) {
                return { totalVotes: 0, optionCounts: {} };
            }
            
            const totalVotes = parseInt(counts.total || '0');
            const optionCounts = {};
            Object.keys(counts).forEach(key => {
                if (key !== 'total') {
                    optionCounts[key] = parseInt(counts[key] || '0');
                }
            });
            
            return { totalVotes, optionCounts };
        } else {
            const counts = inMemoryStorage.voteCounts.get(questionId) || { total: 0 };
            const totalVotes = counts.total || 0;
            const optionCounts = Object.fromEntries(
                Object.entries(counts).filter(([key]) => key !== 'total')
            );
            return { totalVotes, optionCounts };
        }
    },

    /**
     * Get correct vote count
     */
    async getCorrectCount(questionId) {
        const redis = getRedisClient();
        if (redis) {
            const count = await redis.get(`question:${questionId}:votes:correct`);
            return parseInt(count || '0');
        } else {
            return inMemoryStorage.correctCounts.get(questionId) || 0;
        }
    },

    /**
     * Cleanup vote data for a question
     */
    async cleanupVotes(questionId) {
        const redis = getRedisClient();
        if (redis) {
            await redis.del(
                `question:${questionId}:votes:counts`,
                `question:${questionId}:votes:users`,
                `question:${questionId}:votes:correct`
            );
        } else {
            inMemoryStorage.voteCounts.delete(questionId);
            inMemoryStorage.userVotes.delete(questionId);
            inMemoryStorage.correctCounts.delete(questionId);
        }
    }
};

/**
 * Audience Presence Operations
 */
const audienceService = {
    /**
     * Add user to conference audience
     */
    async addUser(conferenceId, userId) {
        const redis = getRedisClient();
        if (redis) {
            await redis.sadd(`conference:${conferenceId}:audience`, userId);
            await redis.sadd(`user:${userId}:conferences`, conferenceId);
        } else {
            if (!inMemoryStorage.audience.has(conferenceId)) {
                inMemoryStorage.audience.set(conferenceId, new Set());
            }
            inMemoryStorage.audience.get(conferenceId).add(userId);
        }
    },

    /**
     * Remove user from conference audience
     */
    async removeUser(conferenceId, userId) {
        const redis = getRedisClient();
        if (redis) {
            await redis.srem(`conference:${conferenceId}:audience`, userId);
            await redis.srem(`user:${userId}:conferences`, conferenceId);
        } else {
            const audienceSet = inMemoryStorage.audience.get(conferenceId);
            if (audienceSet) {
                audienceSet.delete(userId);
                if (audienceSet.size === 0) {
                    inMemoryStorage.audience.delete(conferenceId);
                }
            }
        }
    },

    /**
     * Get audience count
     */
    async getCount(conferenceId) {
        const redis = getRedisClient();
        if (redis) {
            return await redis.scard(`conference:${conferenceId}:audience`);
        } else {
            const audienceSet = inMemoryStorage.audience.get(conferenceId);
            return audienceSet ? audienceSet.size : 0;
        }
    },

    /**
     * Get all conferences user is in (for cleanup on disconnect)
     */
    async getUserConferences(userId) {
        const redis = getRedisClient();
        if (redis) {
            return await redis.smembers(`user:${userId}:conferences`);
        } else {
            // In-memory: iterate through all conferences
            const conferences = [];
            for (const [confId, audienceSet] of inMemoryStorage.audience.entries()) {
                if (audienceSet.has(userId)) {
                    conferences.push(confId);
                }
            }
            return conferences;
        }
    }
};

/**
 * Lock Operations (Prevent Race Conditions)
 */
const lockService = {
    /**
     * Acquire lock
     */
    async acquire(lockKey, ttl = 5) {
        const redis = getRedisClient();
        if (redis) {
            const result = await redis.set(lockKey, Date.now().toString(), 'EX', ttl, 'NX');
            return result === 'OK';
        } else {
            // In-memory locks (simple implementation)
            // For production, should use proper locking mechanism
            return true; // Simplified for fallback
        }
    },

    /**
     * Release lock
     */
    async release(lockKey) {
        const redis = getRedisClient();
        if (redis) {
            await redis.del(lockKey);
        }
        // In-memory: no-op (locks auto-expire)
    }
};

module.exports = {
    conferenceService,
    questionService,
    votingService,
    audienceService,
    lockService,
    timerIntervals // Expose for timer management
};

