"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = void 0;
const winston_1 = __importDefault(require("winston"));
const { combine, timestamp, json, errors, printf, colorize } = winston_1.default.format;
// Environment-based configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
const logFormat = process.env.LOG_FORMAT || (isDevelopment ? 'pretty' : 'json');
// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});
const logger = winston_1.default.createLogger({
    level: logLevel,
    defaultMeta: {
        service: 'engage-backend',
        environment: process.env.NODE_ENV || 'development',
    },
    transports: [
        new winston_1.default.transports.Console({
            format: logFormat === 'json'
                ? combine(timestamp(), json(), errors({ stack: true }))
                : combine(colorize(), timestamp(), devFormat),
        }),
    ],
});
// Request logging middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            userAgent: req.get('user-agent'),
            ip: req.ip,
        });
    });
    next();
};
exports.requestLogger = requestLogger;
exports.default = logger;
//# sourceMappingURL=logger.js.map