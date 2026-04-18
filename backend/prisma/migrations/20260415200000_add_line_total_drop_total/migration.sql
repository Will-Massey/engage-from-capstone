-- Add lineTotal to ProposalService and drop the old total column
-- This aligns the database with the Prisma schema

-- 1. Add lineTotal column
ALTER TABLE "ProposalService"
ADD COLUMN IF NOT EXISTS "lineTotal" DOUBLE PRECISION;

-- 2. Migrate existing data from total to lineTotal
UPDATE "ProposalService"
SET "lineTotal" = "total"
WHERE "lineTotal" IS NULL;

-- 3. Drop the old total column
ALTER TABLE "ProposalService"
DROP COLUMN IF EXISTS "total";
