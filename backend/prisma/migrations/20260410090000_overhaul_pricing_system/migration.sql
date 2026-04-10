-- Migration: Complete Pricing System Overhaul
-- Makes pricing transparent and intuitive

-- 1. Update ProposalService to store clear pricing
-- Add display price (what the user sees)
ALTER TABLE "ProposalService" 
ADD COLUMN IF NOT EXISTS "displayPrice" DOUBLE PRECISION;

-- Add billing frequency for this line item
ALTER TABLE "ProposalService" 
ADD COLUMN IF NOT EXISTS "billingFrequency" TEXT DEFAULT 'MONTHLY';

-- Add annual equivalent (for comparison)
ALTER TABLE "ProposalService" 
ADD COLUMN IF NOT EXISTS "annualEquivalent" DOUBLE PRECISION DEFAULT 0;

-- 2. Update ServiceTemplate with clearer pricing fields
-- Store the actual price amount
ALTER TABLE "ServiceTemplate" 
ADD COLUMN IF NOT EXISTS "priceAmount" DOUBLE PRECISION;

-- Store how to display it (PER_MONTH, PER_YEAR, etc)
ALTER TABLE "ServiceTemplate" 
ADD COLUMN IF NOT EXISTS "priceDisplayMode" TEXT DEFAULT 'PER_MONTH';

-- 3. Migrate existing data
-- Set displayPrice from unitPrice where null
UPDATE "ProposalService" 
SET "displayPrice" = "unitPrice"
WHERE "displayPrice" IS NULL;

-- Set priceAmount from basePrice where null
UPDATE "ServiceTemplate" 
SET "priceAmount" = "basePrice"
WHERE "priceAmount" IS NULL;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS "ProposalService_billingFrequency_idx" 
ON "ProposalService"("billingFrequency");

CREATE INDEX IF NOT EXISTS "ServiceTemplate_priceDisplayMode_idx" 
ON "ServiceTemplate"("priceDisplayMode");
