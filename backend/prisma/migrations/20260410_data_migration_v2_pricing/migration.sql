-- Data Migration: Copy basePrice -> priceAmount and defaultFrequency -> billingCycle

UPDATE "ServiceTemplate" 
SET 
  "priceAmount" = COALESCE("priceAmount", "basePrice", 0),
  "billingCycle" = CASE 
    WHEN "defaultFrequency" = 'ONE_TIME' THEN 'MONTHLY'::text
    ELSE COALESCE("defaultFrequency"::text, 'MONTHLY')
  END::"BillingCycle",
  "priceDisplayMode" = CASE 
    WHEN "defaultFrequency" = 'ANNUALLY' THEN 'PER_YEAR'
    WHEN "defaultFrequency" = 'QUARTERLY' THEN 'PER_QUARTER'
    WHEN "defaultFrequency" = 'ONE_TIME' THEN 'ONE_TIME'
    ELSE 'PER_MONTH'
  END
WHERE "priceAmount" IS NULL OR "priceAmount" = 0;
