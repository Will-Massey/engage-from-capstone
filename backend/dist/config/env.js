"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.string().default('3001'),
    HOST: zod_1.z.string().default('0.0.0.0'),
    DATABASE_URL: zod_1.z.string().startsWith('postgresql://'),
    JWT_SECRET: zod_1.z.string().min(32),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    BCRYPT_ROUNDS: zod_1.z.string().default('12'),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:5173'),
    REDIS_URL: zod_1.z.string().optional(),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    LOG_FORMAT: zod_1.z.enum(['json', 'pretty']).default('pretty'),
    SENDGRID_API_KEY: zod_1.z.string().optional(),
    STRIPE_SECRET_KEY: zod_1.z.string().optional(),
    SENTRY_DSN: zod_1.z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    parsed.error.issues.forEach((issue) => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
}
exports.env = parsed.data;
//# sourceMappingURL=env.js.map