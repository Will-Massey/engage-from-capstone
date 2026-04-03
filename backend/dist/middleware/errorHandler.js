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
    constructor(statusCode, code, message) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
const errorHandler = (err, req, res, _next) => {
    logger_1.default.error('Unhandled error', {
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