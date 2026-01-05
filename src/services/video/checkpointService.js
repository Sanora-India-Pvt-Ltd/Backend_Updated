const Question = require('../../models/course/Question');

/**
 * Create questions for video
 */
const createQuestion = async (videoId, questionData) => {
    const question = await Question.create({
        videoId,
        ...questionData
    });

    return question;
};

/**
 * Validate answer logic (no DB write for wrong answers)
 */
const validateAnswer = async (questionId, userAnswer) => {
    const question = await Question.findById(questionId);

    if (!question) {
        return { valid: false, correct: false };
    }

    const isCorrect = question.correctAnswer === userAnswer;

    return {
        valid: true,
        correct: isCorrect,
        correctAnswer: isCorrect ? question.correctAnswer : undefined
    };
};

/**
 * Update question metadata
 */
const updateQuestion = async (questionId, updateData) => {
    const question = await Question.findByIdAndUpdate(
        questionId,
        updateData,
        { new: true }
    );

    return question;
};

module.exports = {
    createQuestion,
    validateAnswer,
    updateQuestion
};

