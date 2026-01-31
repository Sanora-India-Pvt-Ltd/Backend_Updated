const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (process.env.NODE_ENV !== 'production') console.error(err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    const payload = {
        success: false,
        message: process.env.NODE_ENV === 'production' && statusCode === 500 ? 'Internal Server Error' : message
    };
    if (process.env.NODE_ENV === 'development' && err.stack) payload.stack = err.stack;
    if (err.hint !== undefined) payload.hint = err.hint;
    if (err.suggestion !== undefined) payload.suggestion = err.suggestion;
    if (err.remainingAttempts !== undefined) payload.remainingAttempts = err.remainingAttempts;
    if (err.transactionAborted === true) payload.transactionAborted = true;
    if (err.technicalDetails !== undefined) payload.technicalDetails = err.technicalDetails;
    if (process.env.NODE_ENV === 'development' && err.message) payload.error = err.message;

    res.status(statusCode).json(payload);
};

module.exports = errorHandler;