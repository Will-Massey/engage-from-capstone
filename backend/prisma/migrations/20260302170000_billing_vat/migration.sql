-- Migration: Add billing cycles, VAT settings, and proposal enhancements

-- Add billing cycle enum
CREATE TYPE "BillingCycle" AS ENUM ('FIXED_DATE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- Add VAT rate enum for UK
CREATE TYPE "VATRate" AS ENUM ('ZERO', 'REDUCED_5', 'STANDARD_20', 'EXEMPT');

-- Alter ServiceTemplate to add billing cycle options
ALTER TABLE "ServiceTemplate" 
ADD COLUMN "billingCycle" "BillingCycle" DEFAULT 'MONTHLY',
ADD COLUMN "vatRate" "VATRate" DEFAULT 'STANDARD_20',
ADD COLUMN "isVatApplicable" BOOLEAN DEFAULT true,
ADD COLUMN "fixedBillingDate" TIMESTAMP, -- For fixed date billing
ADD COLUMN "billingDayOfMonth" INTEGER CHECK ("billingDayOfMonth" BETWEEN 1 AND 31), -- For monthly billing
ADD COLUMN "annualEquivalent" DECIMAL(10,2); -- Annual cost for monthly calculations

-- Alter Tenant to add VAT default settings
ALTER TABLE "Tenant"
ADD COLUMN "vatRegistered" BOOLEAN DEFAULT true,
ADD COLUMN "vatNumber" TEXT,
ADD COLUMN "defaultVatRate" "VATRate" DEFAULT 'STANDARD_20',
ADD COLUMN "autoApplyVat" BOOLEAN DEFAULT true;

-- Create ProposalView tracking table
CREATE TABLE "ProposalView" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "proposalId" TEXT NOT NULL REFERENCES "Proposal"("id") ON DELETE CASCADE,
    "viewedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "viewDuration" INTEGER, -- seconds
    "completed" BOOLEAN DEFAULT false
);

-- Create ProposalSignature table for e-signatures
CREATE TABLE "ProposalSignature" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "proposalId" TEXT NOT NULL REFERENCES "Proposal"("id") ON DELETE CASCADE,
    "signedBy" TEXT NOT NULL,
    "signedByRole" TEXT NOT NULL,
    "signatureData" TEXT NOT NULL, -- Base64 encoded signature image
    "signedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "agreementVersion" TEXT NOT NULL,
    "agreementAccepted" BOOLEAN NOT NULL DEFAULT true
);

-- Add engagement letter fields to Proposal
ALTER TABLE "Proposal"
ADD COLUMN "engagementLetter" TEXT,
ADD COLUMN "termsAccepted" BOOLEAN DEFAULT false,
ADD COLUMN "termsAcceptedAt" TIMESTAMP,
ADD COLUMN "shareToken" TEXT UNIQUE,
ADD COLUMN "shareTokenExpiry" TIMESTAMP,
ADD COLUMN "publicAccessEnabled" BOOLEAN DEFAULT false;

-- Add email tracking to Proposal
ALTER TABLE "Proposal"
ADD COLUMN "lastEmailedAt" TIMESTAMP,
ADD COLUMN "emailHistory" JSONB DEFAULT '[]';

-- Create indexes
CREATE INDEX "idx_proposal_view_proposalId" ON "ProposalView"("proposalId");
CREATE INDEX "idx_proposal_signature_proposalId" ON "ProposalSignature"("proposalId");
CREATE INDEX "idx_proposal_share_token" ON "Proposal"("shareToken");

-- Update existing service templates with default values
UPDATE "ServiceTemplate" SET "billingCycle" = 'MONTHLY', "isVatApplicable" = true, "vatRate" = 'STANDARD_20';
