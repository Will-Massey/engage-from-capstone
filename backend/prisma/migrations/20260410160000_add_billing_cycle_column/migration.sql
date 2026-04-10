-- Migration: Add missing billingCycle column to ServiceTemplate
-- This column was in the schema but never added to the database

-- Create the BillingCycle enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingCycle') THEN
    CREATE TYPE "BillingCycle" AS ENUM ('FIXED_DATE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');
  END IF;
END $$;

-- Add the billingCycle column to ServiceTemplate
ALTER TABLE "ServiceTemplate" 
ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle" DEFAULT 'MONTHLY';

-- Create index for the new column
CREATE INDEX IF NOT EXISTS "ServiceTemplate_billingCycle_idx" 
ON "ServiceTemplate"("billingCycle");
