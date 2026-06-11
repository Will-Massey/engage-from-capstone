-- Signature audit / authenticity fields
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "signerEmail" TEXT;
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "documentHash" TEXT;
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "termsHash" TEXT;
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "consentText" TEXT;
ALTER TABLE "ProposalSignature" ADD COLUMN IF NOT EXISTS "signatureType" TEXT NOT NULL DEFAULT 'SIMPLE_ELECTRONIC';
