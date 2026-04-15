-- Add missing contractStartDate column to Proposal
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "contractStartDate" TIMESTAMP(3);
