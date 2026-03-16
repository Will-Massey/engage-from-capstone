-- Comprehensive schema fix migration
-- This adds all missing columns to match the Prisma schema

-- Add missing columns to Tenant table
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionTier" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "lastPaymentStatus" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "lastPaymentDate" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emailQuota" INTEGER DEFAULT 1000;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "storageQuota" BIGINT DEFAULT 5368709120;

-- Add missing columns to User table  
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar" TEXT;

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

-- Create indexes
CREATE INDEX IF NOT EXISTS "Tenant_stripeCustomerId_idx" ON "Tenant"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "Proposal_shareToken_idx" ON "Proposal"("shareToken");
