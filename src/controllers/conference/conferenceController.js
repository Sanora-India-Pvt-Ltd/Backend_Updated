const Conference = require('../../models/conference/Conference');
const ConferenceQuestion = require('../../models/conference/ConferenceQuestion');
const ConferenceMedia = require('../../models/conference/ConferenceMedia');
const ConferenceQuestionAnalytics = require('../../models/conference/ConferenceQuestionAnalytics');
const Speaker = require('../../models/conference/Speaker');
const Conversation = require('../../models/social/Conversation');
const GroupJoinRequest = require('../../models/GroupJoinRequest');
const Media = require('../../models/Media');
const User = require('../../models/authorization/User');
const { getUserConferenceRole, ROLES } = require('../../middleware/conferenceRoles');
const { generateQRCode } = require('../../../services/qrService');
const mongoose = require('mongoose');

const HOST_OWNER_SELECT = 'account.email account.phone account.role account.status profile.name profile.bio profile.images.avatar profile.images.cover verification.isVerified';

/**
 * Helper function to find conference by ID or public code
 * @param {string} identifier - Either MongoDB ObjectId or public code
 * @returns {Promise<Object|null>} Conference document or null
 */
const findConferenceByIdOrCode = async (identifier) => {
    // Check if identifier is a valid ObjectId (24 hex characters)
    if (mongoose.Types.ObjectId.isValid(identifier) && identifier.length === 24) {
        // Try to find by ObjectId first
        const conference = await Conference.findById(identifier);
        if (conference) {
            return conference;
        }
    }
    
    // If not found by ObjectId or not a valid ObjectId, try public code
    // Public codes are uppercase, so convert to uppercase
    const conference = await Conference.findOne({ 
        publicCode: identifier.toUpperCase().trim() 
    });
    return conference;
};

/**
 * Generate unique public code for conference
 */
const generatePublicCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

/**
 * Create a new conference (HOST/SUPER_ADMIN only)
 */
const createConference = async (req, res) => {
    try {
        const { title, description, speakerIds } = req.body;
        let hostId = null;
        let ownerModel = 'User';

        if (req.hostUser) {
            hostId = req.hostUser._id;
            ownerModel = 'Host';
        } else if (req.speaker) {
            hostId = req.speaker._id;
            ownerModel = 'Speaker';
        } else if (req.user) {
            hostId = req.user._id;
            ownerModel = 'User';
        }

        if (!hostId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Validate input
        if (!title || typeof title !== 'string' || title.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Conference title is required'
            });
        }

        // Validate speakers if provided
        let speakers = [];
        if (speakerIds && Array.isArray(speakerIds) && speakerIds.length > 0) {
            const validSpeakers = await Speaker.find({
                _id: { $in: speakerIds }
            });

            if (validSpeakers.length !== speakerIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more speaker IDs are invalid'
                });
            }

            speakers = validSpeakers.map(s => s._id);
        }

        if (req.speaker) {
            const ownerSpeakerId = req.speaker._id;
            if (!speakers.some(id => id.toString() === ownerSpeakerId.toString())) {
                speakers.push(ownerSpeakerId);
            }
        }

        // Generate unique public code
        let publicCode;
        let isUnique = false;
        while (!isUnique) {
            publicCode = generatePublicCode();
            const existing = await Conference.findOne({ publicCode });
            if (!existing) {
                isUnique = true;
            }
        }

        // Create conference
        const conference = await Conference.create({
            title: title.trim(),
            description: description || '',
            hostId: hostId,
            ownerModel,
            speakers: speakers,
            publicCode,
            status: 'DRAFT'
        });

        // Generate QR code for the conference
        try {
            const qrCodeImage = await generateQRCode(publicCode);
            conference.qrCodeImage = qrCodeImage;
            await conference.save();
        } catch (qrError) {
            console.error('Failed to generate QR code for conference:', qrError);
            // Continue without QR code - it can be generated later if needed
        }

        // Initialize Redis state for conference
        const { conferenceService } = require('../../services/conferencePollingService');
        await conferenceService.setStatus(conference._id.toString(), 'DRAFT');
        await conferenceService.setHost(conference._id.toString(), hostId.toString());

        await conference.populate('hostId', HOST_OWNER_SELECT);
        await conference.populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar');

        res.status(201).json({
            success: true,
            data: conference
        });
    } catch (error) {
        console.error('Create conference error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create conference',
            error: error.message
        });
    }
};

/**
 * Get all conferences (with role-based filtering)
 */
const getConferences = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { status, role } = req.query;

        let query = {};

        // Filter by status if provided
        if (status && ['DRAFT', 'ACTIVE', 'ENDED'].includes(status)) {
            query.status = status;
        }

        // Role-based filtering
        if (userId) {
            const user = await User.findById(userId);
            if (user && (user.role === 'SUPER_ADMIN' || user.role === 'admin')) {
                // SUPER_ADMIN sees all
            } else if (role === 'host') {
                // HOST sees only their conferences
                query.hostId = userId;
            } else if (role === 'speaker') {
                // SPEAKER sees conferences they're assigned to
                const speaker = await Speaker.findOne({ 'account.email': user.profile?.email });
                if (speaker) {
                    query.speakers = speaker._id;
                } else {
                    query.speakers = { $in: [] }; // No conferences
                }
            }
        }

        const conferences = await Conference.find(query)
            .populate('hostId', HOST_OWNER_SELECT)
            .populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: conferences
        });
    } catch (error) {
        console.error('Get conferences error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conferences',
            error: error.message
        });
    }
};

/**
 * Get conference by ID
 */
const getConferenceById = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const userId = req.user?._id;

        const conference = await Conference.findById(conferenceId)
            .populate('hostId', HOST_OWNER_SELECT)
            .populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar');

        if (!conference) {
            return res.status(404).json({
                success: false,
                message: 'Conference not found'
            });
        }

        // Attach user role if authenticated
        let userRole = null;
        if (userId) {
            const user = await User.findById(userId);
            if (user) {
                userRole = await getUserConferenceRole(user, conference);
            }
        }

        res.json({
            success: true,
            data: {
                ...conference.toObject(),
                userRole
            }
        });
    } catch (error) {
        console.error('Get conference error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conference',
            error: error.message
        });
    }
};

/**
 * Update conference (HOST/SUPER_ADMIN only)
 */
const updateConference = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const { title, description, speakerIds } = req.body;
        const conference = req.conference;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SUPER_ADMIN can update conference'
            });
        }

        // Update fields
        if (title !== undefined) {
            if (typeof title !== 'string' || title.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Conference title cannot be empty'
                });
            }
            conference.title = title.trim();
        }

        if (description !== undefined) {
            conference.description = description || '';
        }

        if (speakerIds !== undefined) {
            if (!Array.isArray(speakerIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'speakerIds must be an array'
                });
            }

            if (speakerIds.length > 0) {
                const validSpeakers = await Speaker.find({
                    _id: { $in: speakerIds }
                });

                if (validSpeakers.length !== speakerIds.length) {
                    return res.status(400).json({
                        success: false,
                        message: 'One or more speaker IDs are invalid'
                    });
                }

                conference.speakers = validSpeakers.map(s => s._id);
            } else {
                conference.speakers = [];
            }
        }

        await conference.save();
        await conference.populate('hostId', HOST_OWNER_SELECT);
        await conference.populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar');

        res.json({
            success: true,
            data: conference
        });
    } catch (error) {
        console.error('Update conference error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update conference',
            error: error.message
        });
    }
};

/**
 * Activate conference (HOST/SUPER_ADMIN only)
 */
const activateConference = async (req, res) => {
    try {
        const conference = req.conference;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SUPER_ADMIN can activate conference'
            });
        }

        if (conference.status === 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Conference is already active'
            });
        }

        if (conference.status === 'ENDED') {
            return res.status(400).json({
                success: false,
                message: 'Cannot activate an ended conference'
            });
        }

        conference.status = 'ACTIVE';
        await conference.save();

        // Sync status to Redis for real-time polling
        const { conferenceService } = require('../../services/conferencePollingService');
        await conferenceService.setStatus(conference._id.toString(), 'ACTIVE');
        await conferenceService.setHost(conference._id.toString(), conference.hostId.toString());

        await conference.populate('hostId', HOST_OWNER_SELECT);
        await conference.populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar');

        res.json({
            success: true,
            data: conference
        });
    } catch (error) {
        console.error('Activate conference error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to activate conference',
            error: error.message
        });
    }
};

/**
 * End conference (HOST/SUPER_ADMIN only)
 * Creates group automatically
 */
const endConference = async (req, res) => {
    try {
        const conference = req.conference;
        const userRole = req.userRole;
        const userId = req.user._id;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SUPER_ADMIN can end conference'
            });
        }

        if (conference.status === 'ENDED') {
            return res.status(400).json({
                success: false,
                message: 'Conference is already ended'
            });
        }

        // Close any live question
        await ConferenceQuestion.updateMany(
            { conferenceId: conference._id, isLive: true },
            { isLive: false, status: 'CLOSED' }
        );

        // End conference
        conference.status = 'ENDED';
        conference.endedAt = new Date();

        // Sync status to Redis for real-time polling
        const { conferenceService } = require('../../services/conferencePollingService');
        await conferenceService.setStatus(conference._id.toString(), 'ENDED');

        // Create group if not exists
        if (!conference.groupId) {
            const participants = [conference.hostId];
            
            // Add SUPER_ADMIN if exists
            const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
            if (superAdmin && !participants.includes(superAdmin._id)) {
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
        await conference.populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar');
        await conference.populate('groupId');

        res.json({
            success: true,
            data: conference
        });
    } catch (error) {
        console.error('End conference error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end conference',
            error: error.message
        });
    }
};

/**
 * Add question (HOST/SPEAKER)
 */
const addQuestion = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const { order, questionText, options, correctOption } = req.body;
        const userId = req.user?._id || req.hostUser?._id || req.speaker?._id;
        const conference = req.conference;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SPEAKER can add questions'
            });
        }

        // Validate input
        if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Question text is required'
            });
        }

        if (!options || !Array.isArray(options) || options.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'At least 2 options are required'
            });
        }

        if (!correctOption || typeof correctOption !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Correct option is required'
            });
        }

        // Validate correct option exists in options
        const optionKeys = options.map(opt => opt.key.toUpperCase());
        if (!optionKeys.includes(correctOption.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: 'Correct option must be one of the provided options'
            });
        }

        // Determine createdByRole and createdById
        let createdByRole, createdById, createdByModel;

        if (userRole === ROLES.HOST) {
            createdByRole = 'HOST';
            // Check if authenticated as Host or User
            if (req.hostUser) {
                createdById = req.hostUser._id;
                createdByModel = 'Host';
            } else {
                createdById = userId;
                createdByModel = 'User';
            }
        } else {
            // SPEAKER
            createdByRole = 'SPEAKER';
            // Check if authenticated as Speaker directly
            if (req.speaker) {
                createdById = req.speaker._id;
                createdByModel = 'Speaker';
            } else {
                // Legacy: User authenticated as speaker, need to find speaker by email
                const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
                if (!speaker) {
                    return res.status(404).json({
                        success: false,
                        message: 'Speaker profile not found'
                    });
                }
                createdById = speaker._id;
                createdByModel = 'Speaker';
            }
        }

        // Get max order if not provided
        let questionOrder = order;
        if (!questionOrder) {
            const maxOrderQuestion = await ConferenceQuestion.findOne({ conferenceId })
                .sort({ order: -1 });
            questionOrder = maxOrderQuestion ? maxOrderQuestion.order + 1 : 1;
        }

        // Create question
        const question = await ConferenceQuestion.create({
            conferenceId,
            order: questionOrder,
            questionText: questionText.trim(),
            options: options.map(opt => ({
                key: opt.key.toUpperCase().trim(),
                text: opt.text.trim()
            })),
            correctOption: correctOption.toUpperCase().trim(),
            createdByRole,
            createdById,
            createdByModel,
            status: 'IDLE'
        });

        res.status(201).json({
            success: true,
            data: question
        });
    } catch (error) {
        console.error('Add question error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add question',
            error: error.message
        });
    }
};

/**
 * Update question (HOST can update any, SPEAKER only their own)
 */
const updateQuestion = async (req, res) => {
    try {
        const { conferenceId, questionId } = req.params;
        const { questionText, options, correctOption, order } = req.body;
        const userId = req.user._id;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SPEAKER can update questions'
            });
        }

        const question = await ConferenceQuestion.findById(questionId);
        if (!question || question.conferenceId.toString() !== conferenceId) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Check ownership (SPEAKER can only update their own)
        if (userRole === ROLES.SPEAKER) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (!speaker || question.createdById.toString() !== speaker._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'SPEAKER can only update their own questions'
                });
            }
        }

        // Update fields
        if (questionText !== undefined) {
            if (typeof questionText !== 'string' || questionText.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Question text cannot be empty'
                });
            }
            question.questionText = questionText.trim();
        }

        if (options !== undefined) {
            if (!Array.isArray(options) || options.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'At least 2 options are required'
                });
            }
            question.options = options.map(opt => ({
                key: opt.key.toUpperCase().trim(),
                text: opt.text.trim()
            }));
        }

        if (correctOption !== undefined) {
            const optionKeys = question.options.map(opt => opt.key);
            if (!optionKeys.includes(correctOption.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'Correct option must be one of the provided options'
                });
            }
            question.correctOption = correctOption.toUpperCase().trim();
        }

        if (order !== undefined) {
            question.order = order;
        }

        await question.save();

        res.json({
            success: true,
            data: question
        });
    } catch (error) {
        console.error('Update question error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update question',
            error: error.message
        });
    }
};

/**
 * Delete question (HOST can delete any, SPEAKER only their own)
 */
const deleteQuestion = async (req, res) => {
    try {
        const { conferenceId, questionId } = req.params;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SPEAKER can delete questions'
            });
        }

        const question = await ConferenceQuestion.findById(questionId);
        if (!question || question.conferenceId.toString() !== conferenceId) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Check ownership (SPEAKER can only delete their own)
        if (userRole === ROLES.SPEAKER) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (!speaker || question.createdById.toString() !== speaker._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'SPEAKER can only delete their own questions'
                });
            }
        }

        await ConferenceQuestion.findByIdAndDelete(questionId);
        await ConferenceQuestionAnalytics.findOneAndDelete({ questionId });

        res.json({
            success: true,
            message: 'Question deleted successfully'
        });
    } catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete question',
            error: error.message
        });
    }
};

/**
 * Push question live (HOST can push any, SPEAKER only their own)
 */
const pushQuestionLive = async (req, res) => {
    try {
        const { conferenceId, questionId } = req.params;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SPEAKER can push questions live'
            });
        }

        const conference = req.conference;
        if (conference.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Conference must be ACTIVE to push questions live'
            });
        }

        const question = await ConferenceQuestion.findById(questionId);
        if (!question || question.conferenceId.toString() !== conferenceId) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Check ownership (SPEAKER can only push their own)
        if (userRole === ROLES.SPEAKER) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (!speaker || question.createdById.toString() !== speaker._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'SPEAKER can only push their own questions live'
                });
            }
        }

        // Close any existing live question
        await ConferenceQuestion.updateMany(
            { conferenceId, isLive: true, _id: { $ne: questionId } },
            { isLive: false, status: 'CLOSED' }
        );

        // Set new question as live
        question.isLive = true;
        question.status = 'ACTIVE';
        await question.save();

        res.json({
            success: true,
            data: question
        });
    } catch (error) {
        console.error('Push question live error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to push question live',
            error: error.message
        });
    }
};

/**
 * Get live question (USER)
 */
const getLiveQuestion = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const userId = req.user._id;

        // Find conference by ID or public code
        const conference = await findConferenceByIdOrCode(conferenceId);
        if (!conference) {
            return res.status(404).json({
                success: false,
                message: 'Conference not found'
            });
        }

        if (conference.status !== 'ACTIVE') {
            return res.json({
                success: true,
                data: null,
                message: 'Conference is not active'
            });
        }

        // Use the actual conference _id for the query
        const liveQuestion = await ConferenceQuestion.findOne({
            conferenceId: conference._id,
            isLive: true,
            status: 'ACTIVE'
        });

        if (!liveQuestion) {
            return res.json({
                success: true,
                data: null,
                message: 'No live question'
            });
        }

        // Check if user has already answered
        const hasAnswered = liveQuestion.answers.some(
            answer => answer.userId.toString() === userId.toString()
        );

        // Don't reveal correct answer if user hasn't answered
        const questionData = liveQuestion.toObject();
        if (!hasAnswered) {
            delete questionData.correctOption;
        }

        res.json({
            success: true,
            data: {
                ...questionData,
                hasAnswered
            }
        });
    } catch (error) {
        console.error('Get live question error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch live question',
            error: error.message
        });
    }
};

/**
 * Answer question (USER only)
 */
const answerQuestion = async (req, res) => {
    try {
        const { conferenceId, questionId } = req.params;
        const { selectedOption } = req.body;
        const userId = req.user._id;

        // Find conference by ID or public code
        const conference = await findConferenceByIdOrCode(conferenceId);
        if (!conference) {
            return res.status(404).json({
                success: false,
                message: 'Conference not found'
            });
        }

        if (conference.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Conference must be ACTIVE to answer questions'
            });
        }

        const question = await ConferenceQuestion.findById(questionId);
        if (!question || question.conferenceId.toString() !== conference._id.toString()) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        if (!question.isLive || question.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Question is not live'
            });
        }

        // Check if user has already answered
        const existingAnswer = question.answers.find(
            answer => answer.userId.toString() === userId.toString()
        );

        if (existingAnswer) {
            return res.status(400).json({
                success: false,
                message: 'You have already answered this question'
            });
        }

        // Validate selected option
        const optionKeys = question.options.map(opt => opt.key);
        if (!optionKeys.includes(selectedOption.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid option selected'
            });
        }

        // Add answer
        const isCorrect = selectedOption.toUpperCase() === question.correctOption;
        question.answers.push({
            userId,
            selectedOption: selectedOption.toUpperCase(),
            isCorrect,
            answeredAt: new Date()
        });

        await question.save();

        // Update analytics
        await updateQuestionAnalytics(questionId, selectedOption.toUpperCase(), isCorrect);

        res.json({
            success: true,
            data: {
                isCorrect,
                correctOption: question.correctOption
            }
        });
    } catch (error) {
        console.error('Answer question error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit answer',
            error: error.message
        });
    }
};

/**
 * Update question analytics
 */
const updateQuestionAnalytics = async (questionId, selectedOption, isCorrect) => {
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

        if (isCorrect) {
            analytics.correctCount += 1;
        }

        analytics.lastUpdated = new Date();
        await analytics.save();
    } catch (error) {
        console.error('Update analytics error:', error);
    }
};

/**
 * Get questions for conference
 */
const getQuestions = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const userRole = req.userRole;

        const questions = await ConferenceQuestion.find({ conferenceId })
            .sort({ order: 1 });

        // Filter by ownership for SPEAKER
        let filteredQuestions = questions;
        if (userRole === ROLES.SPEAKER) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (speaker) {
                filteredQuestions = questions.filter(
                    q => q.createdById.toString() === speaker._id.toString()
                );
            } else {
                filteredQuestions = [];
            }
        }

        res.json({
            success: true,
            data: filteredQuestions
        });
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch questions',
            error: error.message
        });
    }
};

/**
 * Add media (HOST/SPEAKER)
 */
const addMedia = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const { mediaId, type } = req.body;
        const userId = req.user._id;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SPEAKER can add media'
            });
        }

        // Validate input
        if (!mediaId || !mongoose.Types.ObjectId.isValid(mediaId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid media ID is required'
            });
        }

        if (!type || !['PPT', 'IMAGE'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Media type must be PPT or IMAGE'
            });
        }

        // Verify media exists
        const media = await Media.findById(mediaId);
        if (!media) {
            return res.status(404).json({
                success: false,
                message: 'Media not found'
            });
        }

        // Determine createdByRole and createdById
        let createdByRole, createdById, createdByModel;

        if (userRole === ROLES.HOST) {
            createdByRole = 'HOST';
            createdById = userId;
            createdByModel = 'User';
        } else {
            // SPEAKER
            createdByRole = 'SPEAKER';
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (!speaker) {
                return res.status(404).json({
                    success: false,
                    message: 'Speaker profile not found'
                });
            }
            createdById = speaker._id;
            createdByModel = 'Speaker';
        }

        // Create conference media
        const conferenceMedia = await ConferenceMedia.create({
            conferenceId,
            mediaId,
            type,
            createdByRole,
            createdById,
            createdByModel
        });

        await conferenceMedia.populate('mediaId');

        res.status(201).json({
            success: true,
            data: conferenceMedia
        });
    } catch (error) {
        console.error('Add media error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add media',
            error: error.message
        });
    }
};

/**
 * Delete media (HOST can delete any, SPEAKER only their own)
 */
const deleteMedia = async (req, res) => {
    try {
        const { conferenceId, mediaId } = req.params;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST or SPEAKER can delete media'
            });
        }

        const conferenceMedia = await ConferenceMedia.findOne({
            conferenceId,
            _id: mediaId
        });

        if (!conferenceMedia) {
            return res.status(404).json({
                success: false,
                message: 'Conference media not found'
            });
        }

        // Check ownership (SPEAKER can only delete their own)
        if (userRole === ROLES.SPEAKER) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (!speaker || conferenceMedia.createdById.toString() !== speaker._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'SPEAKER can only delete their own media'
                });
            }
        }

        await ConferenceMedia.findByIdAndDelete(mediaId);

        res.json({
            success: true,
            message: 'Media deleted successfully'
        });
    } catch (error) {
        console.error('Delete media error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete media',
            error: error.message
        });
    }
};

/**
 * Get conference media
 */
const getMedia = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const userRole = req.userRole;

        let query = { conferenceId };

        // Filter by ownership for SPEAKER
        if (userRole === ROLES.SPEAKER) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (speaker) {
                query.createdById = speaker._id;
            } else {
                query.createdById = { $in: [] }; // No media
            }
        }

        const media = await ConferenceMedia.find(query)
            .populate('mediaId')
            .sort({ uploadedAt: -1 });

        res.json({
            success: true,
            data: media
        });
    } catch (error) {
        console.error('Get media error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch media',
            error: error.message
        });
    }
};

/**
 * Get analytics (role-based visibility)
 */
const getAnalytics = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const userRole = req.userRole;

        // Check permissions
        if (userRole === ROLES.USER) {
            return res.status(403).json({
                success: false,
                message: 'Users cannot view analytics'
            });
        }

        let query = { conferenceId };

        // Filter by ownership for SPEAKER
        if (userRole === ROLES.SPEAKER) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (speaker) {
                const speakerQuestions = await ConferenceQuestion.find({
                    conferenceId,
                    createdById: speaker._id
                }).select('_id');

                query.questionId = { $in: speakerQuestions.map(q => q._id) };
            } else {
                query.questionId = { $in: [] }; // No analytics
            }
        }

        const analytics = await ConferenceQuestionAnalytics.find(query)
            .populate('questionId', 'questionText order')
            .sort({ 'questionId.order': 1 });

        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
};

/**
 * Request to join group (USER)
 */
const requestGroupJoin = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const userId = req.user._id;

        // Find conference by ID or public code
        const conference = await findConferenceByIdOrCode(conferenceId);
        if (!conference) {
            return res.status(404).json({
                success: false,
                message: 'Conference not found'
            });
        }

        if (!conference.groupId) {
            return res.status(400).json({
                success: false,
                message: 'Conference group not created yet'
            });
        }

        // Check if request already exists
        const existingRequest = await GroupJoinRequest.findOne({
            groupId: conference.groupId,
            userId
        });

        if (existingRequest) {
            if (existingRequest.status === 'APPROVED') {
                return res.status(400).json({
                    success: false,
                    message: 'You are already a member of this group'
                });
            }
            if (existingRequest.status === 'PENDING') {
                return res.status(400).json({
                    success: false,
                    message: 'Join request is already pending'
                });
            }
        }

        // Create or update request
        const joinRequest = await GroupJoinRequest.findOneAndUpdate(
            { groupId: conference.groupId, userId },
            { status: 'PENDING', reviewedBy: null, reviewedAt: null },
            { upsert: true, new: true }
        ).populate('userId', 'profile.name.full profile.profileImage')
         .populate('groupId');

        res.status(201).json({
            success: true,
            data: joinRequest
        });
    } catch (error) {
        console.error('Request group join error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to request group join',
            error: error.message
        });
    }
};

/**
 * Approve/reject group join request (SUPER_ADMIN only)
 */
const reviewGroupJoinRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // 'APPROVE' or 'REJECT'
        const userId = req.user._id;

        // Check if user is SUPER_ADMIN
        if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only SUPER_ADMIN can review join requests'
            });
        }

        if (!['APPROVE', 'REJECT'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Action must be APPROVE or REJECT'
            });
        }

        const joinRequest = await GroupJoinRequest.findById(requestId);
        if (!joinRequest) {
            return res.status(404).json({
                success: false,
                message: 'Join request not found'
            });
        }

        if (joinRequest.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Join request is not pending'
            });
        }

        if (action === 'APPROVE') {
            joinRequest.status = 'APPROVED';
            joinRequest.reviewedBy = userId;
            joinRequest.reviewedAt = new Date();

            // Add user to group
            const group = await Conversation.findById(joinRequest.groupId);
            if (group && !group.participants.includes(joinRequest.userId)) {
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

        res.json({
            success: true,
            data: joinRequest
        });
    } catch (error) {
        console.error('Review group join request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to review join request',
            error: error.message
        });
    }
};

/**
 * Get conference materials (role-based access)
 */
const getConferenceMaterials = async (req, res) => {
    try {
        const { conferenceId } = req.params;
        const userId = req.user._id;
        const userRole = req.userRole;

        // Find conference by ID or public code
        const conference = await findConferenceByIdOrCode(conferenceId);
        if (!conference) {
            return res.status(404).json({
                success: false,
                message: 'Conference not found'
            });
        }

        // Check access permissions
        let hasAccess = false;

        if (userRole === ROLES.SUPER_ADMIN || userRole === ROLES.HOST || userRole === ROLES.SPEAKER) {
            hasAccess = true;
        } else if (userRole === ROLES.USER) {
            // USER needs to be approved member of group
            if (conference.groupId) {
                const group = await Conversation.findById(conference.groupId);
                if (group && group.participants.includes(userId)) {
                    hasAccess = true;
                } else {
                    // Check if user has approved join request
                    const approvedRequest = await GroupJoinRequest.findOne({
                        groupId: conference.groupId,
                        userId,
                        status: 'APPROVED'
                    });
                    hasAccess = !!approvedRequest;
                }
            }
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You must be an approved group member to view materials'
            });
        }

        // Get materials - use actual conference _id
        const questions = await ConferenceQuestion.find({ conferenceId: conference._id })
            .sort({ order: 1 });

        const media = await ConferenceMedia.find({ conferenceId: conference._id })
            .populate('mediaId')
            .sort({ uploadedAt: -1 });

        res.json({
            success: true,
            data: {
                questions: questions.map(q => ({
                    ...q.toObject(),
                    correctOption: q.correctOption // Reveal correct answers
                })),
                media
            }
        });
    } catch (error) {
        console.error('Get conference materials error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conference materials',
            error: error.message
        });
    }
};

/**
 * Get conference by public code (public route, no auth required)
 */
const getConferenceByPublicCode = async (req, res) => {
    try {
        const { publicCode } = req.params;

        if (!publicCode) {
            return res.status(400).json({
                success: false,
                message: 'Public code is required'
            });
        }

        // Find conference by public code
        const conference = await Conference.findOne({ 
            publicCode: publicCode.toUpperCase().trim() 
        })
            .populate('hostId', HOST_OWNER_SELECT)
            .populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar');

        if (!conference) {
            return res.status(404).json({
                success: false,
                message: 'Conference not found'
            });
        }

        res.json({
            success: true,
            data: conference
        });
    } catch (error) {
        console.error('Get conference by public code error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conference',
            error: error.message
        });
    }
};

/**
 * Regenerate QR code for conference (HOST/SPEAKER/SUPER_ADMIN)
 */
const regenerateQRCode = async (req, res) => {
    try {
        const conference = req.conference;
        const userRole = req.userRole;

        // Check permissions
        if (userRole !== ROLES.HOST && userRole !== ROLES.SPEAKER && userRole !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({
                success: false,
                message: 'Only HOST, SPEAKER, or SUPER_ADMIN can regenerate QR code'
            });
        }

        // Generate QR code
        try {
            const qrCodeImage = await generateQRCode(conference.publicCode);
            conference.qrCodeImage = qrCodeImage;
            await conference.save();

            await conference.populate('hostId', HOST_OWNER_SELECT);
            await conference.populate('speakers', 'account.email account.phone profile.name profile.bio profile.images.avatar');

            res.json({
                success: true,
                data: conference,
                message: 'QR code regenerated successfully'
            });
        } catch (qrError) {
            console.error('Failed to generate QR code:', qrError);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate QR code',
                error: qrError.message
            });
        }
    } catch (error) {
        console.error('Regenerate QR code error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to regenerate QR code',
            error: error.message
        });
    }
};

module.exports = {
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
    regenerateQRCode
};

