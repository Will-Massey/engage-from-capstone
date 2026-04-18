import { z } from 'zod';

const boolFromString = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  const normalized = v.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return v;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.string().default('12'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),
  SENDGRID_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ADMIN_SECRET_KEY: z.string().optional(),
  PUBLIC_SEED_KEY: z.string().optional(),
  MIGRATION_SECRET_KEY: z.string().optional(),
  ENABLE_PUBLIC_SEED: boolFromString.default(false),
  ENABLE_SETUP_ENDPOINT: boolFromString.default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
