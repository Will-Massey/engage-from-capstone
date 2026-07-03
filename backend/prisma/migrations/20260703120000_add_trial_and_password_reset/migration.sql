-- Trial expiry + password reset tokens
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PasswordReset" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PasswordReset_tokenHash_idx" ON "PasswordReset"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId");
CREATE INDEX IF NOT EXISTS "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;