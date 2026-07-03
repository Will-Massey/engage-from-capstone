-- AML partner scaffold fields (W3.3)
CREATE TYPE "AmlStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'CLEAR', 'REFER', 'FAILED');

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "amlStatus" "AmlStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "amlCheckedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "amlProviderRef" TEXT;

CREATE INDEX IF NOT EXISTS "Client_amlStatus_idx" ON "Client"("amlStatus");
CREATE INDEX IF NOT EXISTS "Client_amlProviderRef_idx" ON "Client"("amlProviderRef");