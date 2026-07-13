import winston from 'winston';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// --- Sensitive-data redaction -------------------------------------------------
// Scrub secret-like values and email addresses from log messages + metadata.
const SENSITIVE_KEY_RE =
  /(pass(word)?|token|secret|authorization|auth|api[-_]?key|cookie|credential|session)/i;
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function maskEmails(input: string): string {
  return input.replace(EMAIL_RE, (_m, first: string, domain: string) => `${first}***${domain}`);
}

function redactDeep(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (typeof value === 'string') return maskEmails(value);
  if (!value || typeof value !== 'object' || depth > 6) return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, seen, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[REDACTED]' : redactDeep(v, seen, depth + 1);
  }
  return out;
}

const redactFormat = winston.format((info) => {
  if (typeof info.message === 'string') info.message = maskEmails(info.message);
  const seen = new WeakSet<object>();
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'timestamp' || key === 'message') continue;
    const record = info as Record<string, unknown>;
    record[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactDeep(record[key], seen);
  }
  return info;
})();

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
      format: combine(
        errors({ stack: true }),
        redactFormat,
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        process.env.NODE_ENV === 'development' ? devFormat : json()
      ),
    }),
  ],
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(errors({ stack: true }), redactFormat, timestamp(), json()),
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(errors({ stack: true }), redactFormat, timestamp(), json()),
    })
  );
}

// Request context logger
export class ContextLogger {
  private context: Record<string, any>;

  constructor(context: Record<string, any> = {}) {
    this.context = context;
  }

  info(message: string, meta?: Record<string, any>) {
    logger.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta?: Record<string, any>) {
    logger.warn(message, { ...this.context, ...meta });
  }

  error(message: string, meta?: Record<string, any>) {
    logger.error(message, { ...this.context, ...meta });
  }

  debug(message: string, meta?: Record<string, any>) {
    logger.debug(message, { ...this.context, ...meta });
  }
}

export default logger;
