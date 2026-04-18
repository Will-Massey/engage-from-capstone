-- Align BillingCycle with PricingFrequency: allow one-off services on proposal lines
ALTER TYPE "BillingCycle" ADD VALUE 'ONE_TIME';
