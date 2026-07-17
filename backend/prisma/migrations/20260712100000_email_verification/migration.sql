-- Email verification tokens (mirrors PasswordReset) + backfill so existing
-- users are never locked out by verification enforcement.

CREATE TABLE IF NOT EXISTS "EmailVerification" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerification_tokenHash_idx" ON "EmailVerification"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: every user that exists before this deploy (all of prod + all seeds)
-- is treated as verified — only users created via the public signup paths after
-- this migration start with "emailVerified" IS NULL.
UPDATE "User" SET "emailVerified" = CURRENT_TIMESTAMP WHERE "emailVerified" IS NULL;
