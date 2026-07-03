-- Archive superseded proposals + practice-marked losses
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'LOST';

ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "supersededById" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);