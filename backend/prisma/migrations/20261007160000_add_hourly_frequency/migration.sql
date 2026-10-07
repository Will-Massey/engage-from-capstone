-- Hourly is a service frequency: a rate times a quantity of hours.
-- It is not a calendar billing period. New enum values are not used in this migration.
ALTER TYPE "PricingFrequency" ADD VALUE 'HOURLY';
ALTER TYPE "BillingCycle" ADD VALUE 'HOURLY';
