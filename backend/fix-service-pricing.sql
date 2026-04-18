-- Fix priceAmount to match basePrice for all services
UPDATE "ServiceTemplate"
SET "priceAmount" = "basePrice";

-- Fix priceDisplayMode to match the actual billing frequency
UPDATE "ServiceTemplate"
SET "priceDisplayMode" = 
  CASE "defaultFrequency"
    WHEN 'MONTHLY' THEN 'PER_MONTH'
    WHEN 'QUARTERLY' THEN 'PER_QUARTER'
    WHEN 'ANNUALLY' THEN 'PER_YEAR'
    WHEN 'ONE_TIME' THEN 'ONE_TIME'
    ELSE 'PER_MONTH'
  END;
