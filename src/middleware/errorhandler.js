const errorHandler = (err, req, res, next) => {
    // If response was already sent, don't try to send again
    if (res.headersSent) {
        return next(err);
    }

    console.error(err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;