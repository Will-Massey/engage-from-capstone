import winston from 'winston';
const { combine, timestamp, json, errors, printf, colorize } = winston.format;
// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
        service: 'uk-proposal-platform',
        environment: process.env.NODE_ENV || 'development',
    },
    transports: [
        new winston.transports.Console({
            format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), process.env.NODE_ENV === 'development' ? devFormat : json()),
        }),
    ],
});
// Add file transports in production
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: combine(timestamp(), json()),
    }));
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        format: combine(timestamp(), json()),
    }));
}
// Request context logger
export class ContextLogger {
    constructor(context = {}) {
        this.context = context;
    }
    info(message, meta) {
        logger.info(message, { ...this.context, ...meta });
    }
    warn(message, meta) {
        logger.warn(message, { ...this.context, ...meta });
    }
    error(message, meta) {
        logger.error(message, { ...this.context, ...meta });
    }
    debug(message, meta) {
        logger.debug(message, { ...this.context, ...meta });
    }
}
export default logger;
