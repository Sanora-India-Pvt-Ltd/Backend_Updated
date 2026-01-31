/**
 * Centralized status constants used across the project.
 * Do not replace usages in existing code yet — this is the single source of truth for future refactors.
 */

// Conference (Conference.js)
const CONFERENCE_STATUS = {
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE',
    ENDED: 'ENDED'
};

// Conference question (ConferenceQuestion.js)
const CONFERENCE_QUESTION_STATUS = {
    IDLE: 'IDLE',
    ACTIVE: 'ACTIVE',
    CLOSED: 'CLOSED'
};

// Course (Course.js)
const COURSE_STATUS = {
    DRAFT: 'DRAFT',
    LIVE: 'LIVE',
    FULL: 'FULL',
    COMPLETED: 'COMPLETED'
};

// Course enrollment (CourseEnrollment.js)
const ENROLLMENT_STATUS = {
    REQUESTED: 'REQUESTED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    EXPIRED: 'EXPIRED'
};

// Video question (VideoQuestion.js)
const VIDEO_QUESTION_STATUS = {
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE'
};

// MCQ generation job (MCQGenerationJob.js - course & ai)
const MCQ_JOB_STATUS = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
};

// Video transcoding job (VideoTranscodingJob.js)
const TRANSCODING_JOB_STATUS = {
    QUEUED: 'queued',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// Video (Video.js)
const VIDEO_STATUS = {
    UPLOADING: 'UPLOADING',
    READY: 'READY',
    FAILED: 'FAILED'
};

// Token wallet (TokenWallet.js)
const WALLET_STATUS = {
    ACTIVE: 'ACTIVE',
    LOCKED: 'LOCKED'
};

// Group join request (GroupJoinRequest.js)
const GROUP_JOIN_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
};

// Seller application (SellerApplication.js)
const SELLER_APPLICATION_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

// Friend request (FriendRequest.js)
const FRIEND_REQUEST_STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected'
};

// User report (UserReport.js)
const USER_REPORT_STATUS = {
    PENDING: 'pending',
    REVIEWED: 'reviewed',
    ACTION_TAKEN: 'action_taken',
    DISMISSED: 'dismissed'
};

// Message delivery (Message.js)
const MESSAGE_STATUS = {
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read'
};

// Token transaction (TokenTransaction.js)
const TRANSACTION_STATUS = {
    CREDITED: 'CREDITED'
};

module.exports = {
    CONFERENCE_STATUS,
    CONFERENCE_QUESTION_STATUS,
    COURSE_STATUS,
    ENROLLMENT_STATUS,
    VIDEO_QUESTION_STATUS,
    MCQ_JOB_STATUS,
    TRANSCODING_JOB_STATUS,
    VIDEO_STATUS,
    WALLET_STATUS,
    GROUP_JOIN_STATUS,
    SELLER_APPLICATION_STATUS,
    FRIEND_REQUEST_STATUS,
    USER_REPORT_STATUS,
    MESSAGE_STATUS,
    TRANSACTION_STATUS
};
