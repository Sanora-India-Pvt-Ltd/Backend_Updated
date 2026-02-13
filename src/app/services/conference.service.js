const mongoose = require('mongoose');
const cache = require('../../core/infra/cache');
const Conference = require('../../models/conference/Conference');
const ConferenceQuestion = require('../../models/conference/ConferenceQuestion');
const ConferenceMedia = require('../../models/conference/ConferenceMedia');
const ConferenceQuestionAnalytics = require('../../models/conference/ConferenceQuestionAnalytics');
const Speaker = require('../../models/conference/Speaker');
const Conversation = require('../../models/social/Conversation');
const GroupJoinRequest = require('../../models/GroupJoinRequest');
const Media = require('../../models/Media');
const User = require('../../models/authorization/User');
const AppError = require('../../core/errors/AppError');
const { getUserConferenceRole, ROLES } = require('../../core/auth/conferenceRoles');
const { generateQRCode } = require('../../core/infra/qr');

const HOST_OWNER_SELECT =
    'account.email account.phone account.role account.status profile.name profile.bio profile.images.avatar profile.images.cover verification.isVerified';
const SPEAKER_SELECT = 'account.email account.phone profile.name profile.bio profile.images.avatar';

/**
 * Find conference by ID or public code.
 */
async function findConferenceByIdOrCode(identifier) {
    if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
        const conference = await Conference.findById(identifier).select('-__v').lean();
        if (conference) return conference;
    }
    return Conference.findOne({ publicCode: String(identifier).toUpperCase().trim() }).select('-__v').lean();
}

function generatePublicCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Create conference. Returns conference document (populated).
 */
async function createConference(body, context) {
    const { title, description, speakerIds, pptUrl } = body;
    const { hostId, ownerModel } = context;

    if (!hostId) {
        throw new AppError('Authentication required', 401);
    }
    if (!title || typeof title !== 'string' || title.trim() === '') {
        throw new AppError('Conference title is required', 400);
    }

    let speakers = [];
    if (speakerIds && Array.isArray(speakerIds) && speakerIds.length > 0) {
        const validSpeakers = await Speaker.find({ _id: { $in: speakerIds } });
        if (validSpeakers.length !== speakerIds.length) {
            throw new AppError('One or more speaker IDs are invalid', 400);
        }
        speakers = validSpeakers.map((s) => s._id);
    }
    if (context.ownerSpeakerId && !speakers.some((id) => id.toString() === context.ownerSpeakerId.toString())) {
        speakers.push(context.ownerSpeakerId);
    }

    let publicCode;
    let isUnique = false;
    while (!isUnique) {
        publicCode = generatePublicCode();
        const existing = await Conference.findOne({ publicCode });
        if (!existing) isUnique = true;
    }

    const conference = await Conference.create({
        title: title.trim(),
        description: description || '',
        hostId,
        ownerModel,
        speakers,
        publicCode,
        status: 'DRAFT',
        pptUrl: pptUrl || null
    });

    try {
        const qrCodeImage = await generateQRCode(publicCode);
        conference.qrCodeImage = qrCodeImage;
        await conference.save();
    } catch (qrError) {
        console.error('Failed to generate QR code for conference:', qrError);
    }

    const { conferenceService } = require('./conferencePolling');
    await conferenceService.setStatus(conference._id.toString(), 'DRAFT');
    await conferenceService.setHost(conference._id.toString(), hostId.toString());

    await conference.populate('hostId', HOST_OWNER_SELECT);
    await conference.populate('speakers', SPEAKER_SELECT);
    return conference;
}

/**
 * Get conferences list (role-based). Returns array of conferences.
 */
async function getConferences(query, userId) {
    const { status, role } = query;
    const filter = {};

    if (status && ['DRAFT', 'ACTIVE', 'ENDED'].includes(status)) {
        filter.status = status;
    }

    if (userId) {
        const user = await User.findById(userId).select('role profile.email').lean();
        if (user && (user.role === 'SUPER_ADMIN' || user.role === 'admin')) {
            // no filter
        } else if (role === 'host') {
            filter.hostId = userId;
        } else if (role === 'speaker') {
            const speaker = await Speaker.findOne({ 'account.email': user?.profile?.email }).select('_id').lean();
            if (speaker) {
                filter.speakers = speaker._id;
            } else {
                filter.speakers = { $in: [] };
            }
        }
    }

    const conferences = await Conference.find(filter)
        .select('-__v')
        .populate('hostId', HOST_OWNER_SELECT)
        .populate('speakers', SPEAKER_SELECT)
        .sort({ createdAt: -1 })
        .lean();

    return conferences;
}

/**
 * Get conference by ID. Returns { conference, userRole } (conference populated).
 */
async function getConferenceById(conferenceId, req) {
    const cacheKey = `conference:${conferenceId}:${req.user?._id || 'anon'}`;
    const client = cache.getClient();
    if (client) {
        try {
            const cached = await client.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch (e) { /* fall through to DB */ }
    }

    const conference = await Conference.findById(conferenceId)
        .select('-__v')
        .populate('hostId', HOST_OWNER_SELECT)
        .populate('speakers', SPEAKER_SELECT)
        .lean();

    if (!conference) {
        throw new AppError('Conference not found', 404);
    }

    let userRole = null;
    if (req.user) {
        userRole = await getUserConferenceRole(req, conference);
    }

    const result = { conference, userRole };
    if (client) {
        try {
            await client.set(cacheKey, JSON.stringify(result), 'EX', 60);
        } catch (e) { /* ignore */ }
    }
    return result;
}

/**
 * Update conference. Returns updated conference (populated).
 */
async function updateConference(conference, body, userRole, user) {
    if (userRole !== ROLES.HOST && userRole !== ROLES.SUPER_ADMIN) {
        throw new AppError('Only HOST or SUPER_ADMIN can update conference', 403);
    }

    const { title, description, speakerIds, pptUrl } = body;

    if (title !== undefined) {
        if (typeof title !== 'string' || title.trim() === '') {
            throw new AppError('Conference title cannot be empty', 400);
        }
        conference.title = title.trim();
    }
    if (description !== undefined) conference.description = description || '';
    if (speakerIds !== undefined) {
        if (!Array.isArray(speakerIds)) {
            throw new AppError('speakerIds must be an array', 400);
        }
        if (speakerIds.length > 0) {
            const validSpeakers = await Speaker.find({ _id: { $in: speakerIds } });
            if (validSpeakers.length !== speakerIds.length) {
                throw new AppError('One or more speaker IDs are invalid', 400);
            }
            conference.speakers = validSpeakers.map((s) => s._id);
        } else {
            conference.speakers = [];
        }
    }
    if (pptUrl !== undefined) {
        if (pptUrl !== null && pptUrl !== '' && typeof pptUrl === 'string') {
            conference.pptUrl = pptUrl.trim();
        } else if (pptUrl === null || pptUrl === '') {
            conference.pptUrl = null;
        } else {
            throw new AppError('pptUrl must be a valid URL string or null', 400);
        }
    }

    await conference.save();
    await conference.populate('hostId', HOST_OWNER_SELECT);
    await conference.populate('speakers', SPEAKER_SELECT);
    try {
        const client = cache.getClient();
        if (client) {
            const keys = await client.keys(`conference:${conference._id}:*`);
            if (keys.length) await client.del(...keys);
        }
    } catch (e) { /* fail-safe */ }
    return conference;
}

/**
 * Activate conference. Returns updated conference (populated).
 */
async function activateConference(conference, userRole) {
    if (userRole !== ROLES.HOST && userRole !== ROLES.SUPER_ADMIN) {
        throw new AppError('Only HOST or SUPER_ADMIN can activate conference', 403);
    }
    if (conference.status === 'ACTIVE') {
        throw new AppError('Conference is already active', 400);
    }
    if (conference.status === 'ENDED') {
        throw new AppError('Cannot activate an ended conference', 400);
    }

    conference.status = 'ACTIVE';
    await conference.save();

    const { conferenceService } = require('./conferencePolling');
    await conferenceService.setStatus(conference._id.toString(), 'ACTIVE');
    await conferenceService.setHost(conference._id.toString(), conference.hostId.toString());

    await conference.populate('hostId', HOST_OWNER_SELECT);
    await conference.populate('speakers', SPEAKER_SELECT);
    return conference;
}

/**
 * End conference. Returns updated conference (populated) with groupId.
 */
async function endConference(conference, userRole, userId) {
    if (![ROLES.HOST, ROLES.SPEAKER, ROLES.SUPER_ADMIN].includes(userRole)) {
        throw new AppError('Only HOST, SPEAKER, or SUPER_ADMIN can end conference', 403);
    }
    if (conference.status === 'ENDED') {
        throw new AppError('Conference is already ended', 400);
    }

    await ConferenceQuestion.updateMany(
        { conferenceId: conference._id, isLive: true },
        { isLive: false, status: 'CLOSED' }
    );

    conference.status = 'ENDED';
    conference.endedAt = new Date();

    const { conferenceService } = require('./conferencePolling');
    await conferenceService.setStatus(conference._id.toString(), 'ENDED');

    if (!conference.groupId) {
        const participants = [conference.hostId];
        const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
        if (superAdmin && !participants.some((p) => p.toString() === superAdmin._id.toString())) {
            participants.push(superAdmin._id);
        }
        const group = await Conversation.create({
            participants,
            isGroup: true,
            type: 'CONFERENCE_GROUP',
            conferenceId: conference._id,
            groupName: `${conference.title} - Post Conference`,
            admins: participants,
            createdBy: conference.hostId
        });
        conference.groupId = group._id;
    }

    await conference.save();
    await conference.populate('hostId', HOST_OWNER_SELECT);
    await conference.populate('speakers', SPEAKER_SELECT);
    await conference.populate('groupId');
    try {
        const client = cache.getClient();
        if (client) {
            const keys = await client.keys(`conference:${conference._id}:*`);
            if (keys.length) await client.del(...keys);
        }
    } catch (e) { /* fail-safe */ }
    return conference;
}

async function updateQuestionAnalytics(questionId, selectedOption, isCorrect) {
    try {
        let analytics = await ConferenceQuestionAnalytics.findOne({ questionId });
        if (!analytics) {
            const question = await ConferenceQuestion.findById(questionId);
            if (!question) return;
            analytics = await ConferenceQuestionAnalytics.create({
                questionId,
                conferenceId: question.conferenceId,
                totalResponses: 0,
                optionCounts: new Map(),
                correctCount: 0
            });
        }
        analytics.totalResponses += 1;
        const currentCount = analytics.optionCounts.get(selectedOption) || 0;
        analytics.optionCounts.set(selectedOption, currentCount + 1);
        if (isCorrect) analytics.correctCount += 1;
        analytics.lastUpdated = new Date();
        await analytics.save();
    } catch (err) {
        console.error('Update analytics error:', err);
    }
}

/**
 * Add question. Returns created question.
 */
async function addQuestion(conferenceId, body, req) {
    const { order, questionText, options, correctOption, slideIndex, pageNumber } = body;
    const userRole = req.userRole;
    const userId = req.user?._id || req.hostUser?._id || req.speaker?._id;

    if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
        throw new AppError('Only HOST or SPEAKER can add questions', 403);
    }
    if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
        throw new AppError('Question text is required', 400);
    }
    if (!options || !Array.isArray(options) || options.length < 2) {
        throw new AppError('At least 2 options are required', 400);
    }
    if (!correctOption || typeof correctOption !== 'string') {
        throw new AppError('Correct option is required', 400);
    }
    const optionKeys = options.map((opt) => opt.key.toUpperCase());
    if (!optionKeys.includes(correctOption.toUpperCase())) {
        throw new AppError('Correct option must be one of the provided options', 400);
    }

    let createdByRole, createdById, createdByModel;
    if (userRole === ROLES.HOST) {
        createdByRole = 'HOST';
        createdById = req.hostUser ? req.hostUser._id : userId;
        createdByModel = req.hostUser ? 'Host' : 'User';
    } else {
        createdByRole = 'SPEAKER';
        if (req.speaker) {
            createdById = req.speaker._id;
            createdByModel = 'Speaker';
        } else {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (!speaker) throw new AppError('Speaker profile not found', 404);
            createdById = speaker._id;
            createdByModel = 'Speaker';
        }
    }

    let questionOrder = order;
    if (questionOrder == null) {
        const maxOrderQuestion = await ConferenceQuestion.findOne({ conferenceId }).sort({ order: -1 });
        questionOrder = maxOrderQuestion ? maxOrderQuestion.order + 1 : 1;
    }

    let pptSlideIndex = slideIndex !== undefined ? slideIndex : pageNumber;
    if (pptSlideIndex !== undefined) {
        const num = Number(pptSlideIndex);
        if (Number.isNaN(num) || num < 0 || !Number.isInteger(num)) {
            throw new AppError('slideIndex/pageNumber must be a non-negative integer', 400);
        }
        pptSlideIndex = num;
    }

    const createPayload = {
        conferenceId,
        order: questionOrder,
        questionText: questionText.trim(),
        options: options.map((opt) => ({
            key: opt.key.toUpperCase().trim(),
            text: opt.text.trim()
        })),
        correctOption: correctOption.toUpperCase().trim(),
        createdByRole,
        createdById,
        createdByModel,
        status: 'IDLE'
    };
    if (pptSlideIndex !== undefined) createPayload.slideIndex = pptSlideIndex;

    const question = await ConferenceQuestion.create(createPayload);
    try {
        const client = cache.getClient();
        if (client) {
            const keys = await client.keys(`conference:${conferenceId}:*`);
            if (keys.length) await client.del(...keys);
        }
    } catch (e) { /* fail-safe */ }
    return question;
}

/**
 * Update question. Returns updated question.
 */
async function updateQuestion(conferenceId, questionId, body, req) {
    const { questionText, options, correctOption, order, slideIndex, pageNumber } = body;
    const userRole = req.userRole;

    if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
        throw new AppError('Only HOST or SPEAKER can update questions', 403);
    }

    const question = await ConferenceQuestion.findById(questionId);
    if (!question || question.conferenceId.toString() !== conferenceId) {
        throw new AppError('Question not found', 404);
    }
    if (userRole === ROLES.SPEAKER) {
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
        if (!speaker || question.createdById.toString() !== speaker._id.toString()) {
            throw new AppError('SPEAKER can only update their own questions', 403);
        }
    }

    if (questionText !== undefined) {
        if (typeof questionText !== 'string' || questionText.trim() === '') {
            throw new AppError('Question text cannot be empty', 400);
        }
        question.questionText = questionText.trim();
    }
    if (options !== undefined) {
        if (!Array.isArray(options) || options.length < 2) {
            throw new AppError('At least 2 options are required', 400);
        }
        question.options = options.map((opt) => ({
            key: opt.key.toUpperCase().trim(),
            text: opt.text.trim()
        }));
    }
    if (correctOption !== undefined) {
        const optionKeys = question.options.map((opt) => opt.key);
        if (!optionKeys.includes(correctOption.toUpperCase())) {
            throw new AppError('Correct option must be one of the provided options', 400);
        }
        question.correctOption = correctOption.toUpperCase().trim();
    }
    if (order !== undefined) question.order = order;
    if (slideIndex !== undefined || pageNumber !== undefined) {
        const raw = slideIndex !== undefined ? slideIndex : pageNumber;
        if (raw === null || raw === '') {
            question.slideIndex = undefined;
        } else {
            const num = Number(raw);
            if (Number.isNaN(num) || num < 0 || !Number.isInteger(num)) {
                throw new AppError('slideIndex/pageNumber must be a non-negative integer or null', 400);
            }
            question.slideIndex = num;
        }
    }

    await question.save();
    return question;
}

/**
 * Delete question.
 */
async function deleteQuestion(conferenceId, questionId, req) {
    const userRole = req.userRole;

    if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
        throw new AppError('Only HOST or SPEAKER can delete questions', 403);
    }

    const question = await ConferenceQuestion.findById(questionId);
    if (!question || question.conferenceId.toString() !== conferenceId) {
        throw new AppError('Question not found', 404);
    }
    if (userRole === ROLES.SPEAKER) {
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
        if (!speaker || question.createdById.toString() !== speaker._id.toString()) {
            throw new AppError('SPEAKER can only delete their own questions', 403);
        }
    }

    await ConferenceQuestion.findByIdAndDelete(questionId);
    await ConferenceQuestionAnalytics.findOneAndDelete({ questionId });
}

/**
 * Push question live. Returns { question, startedAt, expiresAt }.
 */
async function pushQuestionLive(conferenceId, questionId, body, req) {
    const { duration = 45 } = body;
    const userRole = req.userRole;
    const conference = req.conference;

    if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
        throw new AppError('Only HOST or SPEAKER can push questions live', 403);
    }
    if (conference.status !== 'ACTIVE') {
        throw new AppError('Conference must be ACTIVE to push questions live', 400);
    }

    const question = await ConferenceQuestion.findById(questionId);
    if (!question || question.conferenceId.toString() !== conferenceId) {
        throw new AppError('Question not found', 404);
    }
    if (userRole === ROLES.SPEAKER) {
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
        if (!speaker || question.createdById.toString() !== speaker._id.toString()) {
            throw new AppError('SPEAKER can only push their own questions live', 403);
        }
    }

    const cache = require('../../core/infra/cache');
    const redis = cache.getClient();
    if (!redis) {
        throw new AppError('Redis is required for live questions', 500);
    }

    const startedAt = Date.now();
    const expiresAt = startedAt + duration * 1000;
    const ttlSeconds = duration + 5;

    const liveQuestionData = {
        conferenceId,
        questionId: question._id.toString(),
        questionText: question.questionText,
        options: question.options.map((opt) => ({ key: opt.key, text: opt.text })),
        startedAt,
        expiresAt,
        duration
    };
    if (question.slideIndex != null) liveQuestionData.slideIndex = question.slideIndex;

    const liveQuestionKey = `conference:${conferenceId}:live_question`;
    const setResult = await redis.set(liveQuestionKey, JSON.stringify(liveQuestionData), 'NX');

    if (!setResult) {
        const existingLiveQuestion = await redis.get(liveQuestionKey);
        if (existingLiveQuestion) {
            const existing = JSON.parse(existingLiveQuestion);
            if (existing.questionId === questionId) {
                await redis.setex(liveQuestionKey, ttlSeconds, JSON.stringify(liveQuestionData));
            } else {
                throw new AppError(
                    `Another question (${existing.questionId}) is already live. Close it first.`,
                    400
                );
            }
        }
    } else {
        await redis.expire(liveQuestionKey, ttlSeconds);
    }

    const realtime = require('../../core/infra/realtime');
    const io = realtime.getIO();
    const questionTimers = realtime.getQuestionTimers();

    if (questionTimers && questionTimers.has(conferenceId)) {
        clearTimeout(questionTimers.get(conferenceId));
    }
    const timerDuration = expiresAt - Date.now();
    if (timerDuration > 0) {
        const timeoutId = setTimeout(async () => {
            try {
                const key = `conference:${conferenceId}:live_question`;
                const data = await redis.get(key);
                if (!data) {
                    questionTimers.delete(conferenceId);
                    return;
                }
                const liveQuestion = JSON.parse(data);
                const answersKey = `conference:${conferenceId}:answers:${liveQuestion.questionId}`;
                const closedAt = Date.now();
                const allAnswers = await redis.hgetall(answersKey);
                const totalResponses = Object.keys(allAnswers).length;
                const counts = {};
                liveQuestion.options.forEach((opt) => {
                    counts[opt.key] = 0;
                });
                Object.values(allAnswers).forEach((answerKey) => {
                    if (Object.prototype.hasOwnProperty.call(counts, answerKey)) {
                        counts[answerKey] = (counts[answerKey] || 0) + 1;
                    }
                });
                await ConferenceQuestion.findOneAndUpdate(
                    {
                        _id: liveQuestion.questionId,
                        conferenceId,
                        status: { $ne: 'CLOSED' }
                    },
                    {
                        $set: {
                            status: 'CLOSED',
                            results: { counts, totalResponses, closedAt }
                        }
                    },
                    { new: true }
                );
                io.to(`conference:${conferenceId}`).emit('question:closed', {
                    conferenceId,
                    questionId: liveQuestion.questionId,
                    closedAt
                });
                io.to(`conference:${conferenceId}`).emit('question:results', {
                    conferenceId,
                    questionId: liveQuestion.questionId,
                    counts,
                    totalResponses,
                    closedAt
                });
                await redis.del(key);
                await redis.del(answersKey);
            } catch (err) {
                console.error('Timer error during auto-close:', err);
                if (questionTimers) questionTimers.delete(conferenceId);
            }
        }, timerDuration);
        if (questionTimers) questionTimers.set(conferenceId, timeoutId);
    }

    io.to(`conference:${conferenceId}`).emit('question:live', {
        conferenceId,
        questionId: question._id.toString(),
        questionText: question.questionText,
        options: question.options.map((opt) => ({ key: opt.key, text: opt.text })),
        startedAt,
        expiresAt
    });

    await ConferenceQuestion.updateMany(
        { conferenceId, isLive: true, _id: { $ne: questionId } },
        { isLive: false, status: 'CLOSED' }
    );
    question.isLive = true;
    question.status = 'ACTIVE';
    await question.save();

    return { question, startedAt, expiresAt };
}

/**
 * Get live question. Returns { data, hasAnswered } or { data: null, message }.
 */
async function getLiveQuestion(conferenceId, userId) {
    const conference = await findConferenceByIdOrCode(conferenceId);
    if (!conference) {
        throw new AppError('Conference not found', 404);
    }
    if (conference.status !== 'ACTIVE') {
        return { data: null, message: 'Conference is not active' };
    }

    const liveQuestion = await ConferenceQuestion.findOne({
        conferenceId: conference._id,
        isLive: true,
        status: 'ACTIVE'
    }).lean();

    if (!liveQuestion) {
        return { data: null, message: 'No live question' };
    }

    const hasAnswered = liveQuestion.answers.some(
        (answer) => answer.userId.toString() === userId.toString()
    );
    const questionData = liveQuestion.toObject();
    if (!hasAnswered) delete questionData.correctOption;
    return { data: { ...questionData, hasAnswered } };
}

/**
 * Answer question. Returns { isCorrect, correctOption }.
 */
async function answerQuestion(conferenceId, questionId, body, userId) {
    const { selectedOption } = body;

    const conference = await findConferenceByIdOrCode(conferenceId);
    if (!conference) {
        throw new AppError('Conference not found', 404);
    }
    if (conference.status !== 'ACTIVE') {
        throw new AppError('Conference must be ACTIVE to answer questions', 400);
    }

    const question = await ConferenceQuestion.findById(questionId);
    if (!question || question.conferenceId.toString() !== conference._id.toString()) {
        throw new AppError('Question not found', 404);
    }
    if (!question.isLive || question.status !== 'ACTIVE') {
        throw new AppError('Question is not live', 400);
    }

    const existingAnswer = question.answers.find((answer) => answer.userId.toString() === userId.toString());
    if (existingAnswer) {
        throw new AppError('You have already answered this question', 400);
    }

    const optionKeys = question.options.map((opt) => opt.key);
    if (!optionKeys.includes(selectedOption.toUpperCase())) {
        throw new AppError('Invalid option selected', 400);
    }

    const isCorrect = selectedOption.toUpperCase() === question.correctOption;
    question.answers.push({
        userId,
        selectedOption: selectedOption.toUpperCase(),
        isCorrect,
        answeredAt: new Date()
    });
    await question.save();
    await updateQuestionAnalytics(questionId, selectedOption.toUpperCase(), isCorrect);

    return { isCorrect, correctOption: question.correctOption };
}

/**
 * Get questions for conference. Returns array (filtered by role for SPEAKER).
 */
async function getQuestions(conferenceId, req) {
    const userRole = req.userRole;
    const questions = await ConferenceQuestion.find({ conferenceId }).select('-__v').sort({ order: 1 }).lean();

    let filtered = questions;
    if (userRole === ROLES.SPEAKER) {
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email }).select('_id').lean();
        if (speaker) {
            filtered = questions.filter((q) => q.createdById.toString() === speaker._id.toString());
        } else {
            filtered = [];
        }
    }
    return filtered;
}

/**
 * Add media. Returns created conference media (populated).
 */
async function addMedia(conferenceId, body, req) {
    const { mediaId, type } = body;
    const userRole = req.userRole;
    const userId = req.user._id;

    if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
        throw new AppError('Only HOST or SPEAKER can add media', 403);
    }
    if (!mediaId || !mongoose.Types.ObjectId.isValid(mediaId)) {
        throw new AppError('Valid media ID is required', 400);
    }
    if (!type || !['PPT', 'IMAGE'].includes(type)) {
        throw new AppError('Media type must be PPT or IMAGE', 400);
    }

    const media = await Media.findById(mediaId);
    if (!media) {
        throw new AppError('Media not found', 404);
    }

    let createdByRole, createdById, createdByModel;
    if (userRole === ROLES.HOST) {
        createdByRole = 'HOST';
        createdById = userId;
        createdByModel = 'User';
    } else {
        createdByRole = 'SPEAKER';
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
        if (!speaker) throw new AppError('Speaker profile not found', 404);
        createdById = speaker._id;
        createdByModel = 'Speaker';
    }

    const conferenceMedia = await ConferenceMedia.create({
        conferenceId,
        mediaId,
        type,
        createdByRole,
        createdById,
        createdByModel
    });
    await conferenceMedia.populate('mediaId');
    return conferenceMedia;
}

/**
 * Delete media.
 */
async function deleteMedia(conferenceId, mediaId, req) {
    const userRole = req.userRole;

    if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
        throw new AppError('Only HOST or SPEAKER can delete media', 403);
    }

    const conferenceMedia = await ConferenceMedia.findOne({ conferenceId, _id: mediaId });
    if (!conferenceMedia) {
        throw new AppError('Conference media not found', 404);
    }
    if (userRole === ROLES.SPEAKER) {
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
        if (!speaker || conferenceMedia.createdById.toString() !== speaker._id.toString()) {
            throw new AppError('SPEAKER can only delete their own media', 403);
        }
    }

    await ConferenceMedia.findByIdAndDelete(mediaId);
}

/**
 * Get conference media. Returns array (filtered by role for SPEAKER).
 */
async function getMedia(conferenceId, req) {
    const userRole = req.userRole;
    const query = { conferenceId };

    if (userRole === ROLES.SPEAKER) {
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
        if (speaker) {
            query.createdById = speaker._id;
        } else {
            query.createdById = { $in: [] };
        }
    }

    const media = await ConferenceMedia.find(query).select('-__v').populate('mediaId').sort({ uploadedAt: -1 }).lean();
    return media;
}

/**
 * Get analytics. Returns array of analytics (filtered by role for SPEAKER).
 */
async function getAnalytics(conferenceId, req) {
    const userRole = req.userRole;

    if (userRole === ROLES.USER) {
        throw new AppError('Users cannot view analytics', 403);
    }

    const query = { conferenceId };
    if (userRole === ROLES.SPEAKER) {
        const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
        if (speaker) {
            const speakerQuestions = await ConferenceQuestion.find({
                conferenceId,
                createdById: speaker._id
            }).select('_id');
            query.questionId = { $in: speakerQuestions.map((q) => q._id) };
        } else {
            query.questionId = { $in: [] };
        }
    }

    const analytics = await ConferenceQuestionAnalytics.find(query)
        .populate('questionId', 'questionText order')
        .sort({ 'questionId.order': 1 });
    return analytics;
}

/**
 * Request to join group. Returns join request (populated).
 */
async function requestGroupJoin(conferenceId, userId) {
    const conference = await findConferenceByIdOrCode(conferenceId);
    if (!conference) {
        throw new AppError('Conference not found', 404);
    }
    if (!conference.groupId) {
        throw new AppError('Conference group not created yet', 400);
    }

    const existingRequest = await GroupJoinRequest.findOne({
        groupId: conference.groupId,
        userId
    });
    if (existingRequest) {
        if (existingRequest.status === 'APPROVED') {
            throw new AppError('You are already a member of this group', 400);
        }
        if (existingRequest.status === 'PENDING') {
            throw new AppError('Join request is already pending', 400);
        }
    }

    const joinRequest = await GroupJoinRequest.findOneAndUpdate(
        { groupId: conference.groupId, userId },
        { status: 'PENDING', reviewedBy: null, reviewedAt: null },
        { upsert: true, new: true }
    )
        .populate('userId', 'profile.name.full profile.profileImage')
        .populate('groupId');

    return joinRequest;
}

/**
 * Review group join request. Returns updated join request (populated).
 */
async function reviewGroupJoinRequest(requestId, body, userId, userRole) {
    const { action } = body;

    if (userRole !== 'SUPER_ADMIN' && userRole !== 'admin') {
        throw new AppError('Only SUPER_ADMIN can review join requests', 403);
    }
    if (!['APPROVE', 'REJECT'].includes(action)) {
        throw new AppError('Action must be APPROVE or REJECT', 400);
    }

    const joinRequest = await GroupJoinRequest.findById(requestId);
    if (!joinRequest) {
        throw new AppError('Join request not found', 404);
    }
    if (joinRequest.status !== 'PENDING') {
        throw new AppError('Join request is not pending', 400);
    }

    if (action === 'APPROVE') {
        joinRequest.status = 'APPROVED';
        joinRequest.reviewedBy = userId;
        joinRequest.reviewedAt = new Date();
        const group = await Conversation.findById(joinRequest.groupId);
        if (group && !group.participants.some((p) => p.toString() === joinRequest.userId.toString())) {
            group.participants.push(joinRequest.userId);
            await group.save();
        }
    } else {
        joinRequest.status = 'REJECTED';
        joinRequest.reviewedBy = userId;
        joinRequest.reviewedAt = new Date();
    }
    await joinRequest.save();
    await joinRequest.populate('userId', 'profile.name.full profile.profileImage');
    await joinRequest.populate('groupId');
    return joinRequest;
}

/**
 * Get conference materials. Returns { questions, media }.
 */
async function getConferenceMaterials(conferenceId, userId, userRole, req) {
    const conference = await findConferenceByIdOrCode(conferenceId);
    if (!conference) {
        throw new AppError('Conference not found', 404);
    }

    let hasAccess = false;
    if ([ROLES.SUPER_ADMIN, ROLES.HOST, ROLES.SPEAKER].includes(userRole)) {
        hasAccess = true;
    } else if (userRole === ROLES.USER && conference.groupId) {
        const group = await Conversation.findById(conference.groupId);
        if (group && group.participants.some((p) => p.toString() === userId.toString())) {
            hasAccess = true;
        } else {
            const approvedRequest = await GroupJoinRequest.findOne({
                groupId: conference.groupId,
                userId,
                status: 'APPROVED'
            });
            hasAccess = !!approvedRequest;
        }
    }

    if (!hasAccess) {
        throw new AppError(
            'Access denied. You must be an approved group member to view materials',
            403
        );
    }

    const questions = await ConferenceQuestion.find({ conferenceId: conference._id }).sort({
        order: 1
    });
    const media = await ConferenceMedia.find({ conferenceId: conference._id })
        .populate('mediaId')
        .sort({ uploadedAt: -1 });

    return {
        questions: questions.map((q) => ({ ...q.toObject(), correctOption: q.correctOption })),
        media
    };
}

/**
 * Get conference by public code. Returns conference (populated).
 */
async function getConferenceByPublicCode(publicCode) {
    if (!publicCode) {
        throw new AppError('Public code is required', 400);
    }
    const conference = await Conference.findOne({
        publicCode: publicCode.toUpperCase().trim()
    })
        .select('-__v')
        .populate('hostId', HOST_OWNER_SELECT)
        .populate('speakers', SPEAKER_SELECT)
        .lean();

    if (!conference) {
        throw new AppError('Conference not found', 404);
    }
    return conference;
}

/**
 * Regenerate QR code. Returns updated conference (populated).
 */
async function regenerateQRCode(conference, userRole) {
    if (![ROLES.HOST, ROLES.SPEAKER, ROLES.SUPER_ADMIN].includes(userRole)) {
        throw new AppError('Only HOST, SPEAKER, or SUPER_ADMIN can regenerate QR code', 403);
    }

    const qrCodeImage = await generateQRCode(conference.publicCode);
    conference.qrCodeImage = qrCodeImage;
    await conference.save();
    await conference.populate('hostId', HOST_OWNER_SELECT);
    await conference.populate('speakers', SPEAKER_SELECT);
    return conference;
}

module.exports = {
    findConferenceByIdOrCode,
    createConference,
    getConferences,
    getConferenceById,
    updateConference,
    activateConference,
    endConference,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    pushQuestionLive,
    getLiveQuestion,
    answerQuestion,
    getQuestions,
    addMedia,
    deleteMedia,
    getMedia,
    getAnalytics,
    requestGroupJoin,
    reviewGroupJoinRequest,
    getConferenceMaterials,
    getConferenceByPublicCode,
    regenerateQRCode,
    ROLES
};
