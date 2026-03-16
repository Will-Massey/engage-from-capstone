-- Add missing columns to Proposal table
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "signatoryPosition" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "signatoryName" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "clientSignatoryName" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "clientSignatoryPosition" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "clientSignature" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "clientSignedAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "lastViewedAt" TIMESTAMP(3);

-- Create index for shareToken
CREATE INDEX IF NOT EXISTS "Proposal_shareToken_idx" ON "Proposal"("shareToken");
