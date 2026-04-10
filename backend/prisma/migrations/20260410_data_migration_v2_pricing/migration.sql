-- Data Migration: Copy basePrice -> priceAmount and defaultFrequency -> billingCycle

UPDATE "ServiceTemplate" 
SET 
  "priceAmount" = COALESCE("priceAmount", "basePrice", 0),
  "billingCycle" = CASE 
    WHEN "defaultFrequency" = 'ONE_TIME' THEN 'MONTHLY'::text
    ELSE COALESCE("defaultFrequency"::text, 'MONTHLY')
  END::"BillingCycle",
  "priceDisplayMode" = CASE 
    WHEN "defaultFrequency" = 'ANNUALLY' THEN 'PER_YEAR'::text
    WHEN "defaultFrequency" = 'QUARTERLY' THEN 'PER_QUARTER'::text
    WHEN "defaultFrequency" = 'ONE_TIME' THEN 'ONE_TIME'::text
    ELSE 'PER_MONTH'::text
  END::"PriceDisplayMode"
WHERE "priceAmount" IS NULL OR "priceAmount" = 0;
