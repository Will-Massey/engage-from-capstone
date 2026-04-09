-- Migration: Add VAT fields to ProposalService
-- Created: 2026-04-09

-- Add VAT rate column with default 20%
ALTER TABLE "ProposalService" 
ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION DEFAULT 20;

-- Add VAT amount column
ALTER TABLE "ProposalService" 
ADD COLUMN IF NOT EXISTS "vatAmount" DOUBLE PRECISION DEFAULT 0;

-- Add gross total column (net + VAT)
ALTER TABLE "ProposalService" 
ADD COLUMN IF NOT EXISTS "grossTotal" DOUBLE PRECISION DEFAULT 0;

-- Update existing rows to have default VAT rate
UPDATE "ProposalService" 
SET "vatRate" = 20 
WHERE "vatRate" IS NULL;

-- Create index on vatRate for filtering
CREATE INDEX IF NOT EXISTS "ProposalService_vatRate_idx" 
ON "ProposalService"("vatRate");
