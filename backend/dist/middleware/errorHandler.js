import logger from '../utils/logger';
// Async handler wrapper to catch errors in async routes
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
// API Error class
export class ApiError extends Error {
    constructor(code, message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'ApiError';
    }
}
export const errorHandler = (err, req, res, _next) => {
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id'],
    });
};
// 404 Not Found handler
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.originalUrl} not found`,
        },
    });
};
