-- Add forensic metadata columns to ProposalSignature for UK e-signature compliance
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "deviceInfo" TEXT;
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "geoLocation" TEXT;
