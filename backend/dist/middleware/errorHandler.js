"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = exports.ApiError = exports.asyncHandler = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
// Async handler wrapper to catch errors in async routes
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
// API Error class
class ApiError extends Error {
    constructor(code, message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
const errorHandler = (err, req, res, _next) => {
    // Handle ApiError - return proper status code and message
    if (err instanceof ApiError) {
        logger_1.default.warn('API error', {
            code: err.code,
            message: err.message,
            statusCode: err.statusCode,
            path: req.path,
            method: req.method,
        });
        res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
            },
        });
        return;
    }
    // Handle Zod validation errors
    if (err.name === 'ZodError') {
        logger_1.default.warn('Validation error', {
            message: err.message,
            path: req.path,
            method: req.method,
        });
        res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request data',
                details: err.message,
            },
        });
        return;
    }
    // Log unhandled errors
    logger_1.default.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    // Return generic error in production, detailed in development
    const isDevelopment = process.env.NODE_ENV !== 'production';
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            ...(isDevelopment && { details: err.message }),
        },
    });
};
exports.errorHandler = errorHandler;
// 404 Not Found handler
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.originalUrl} not found`,
        },
    });
};
exports.notFoundHandler = notFoundHandler;
//# sourceMappingURL=errorHandler.js.map