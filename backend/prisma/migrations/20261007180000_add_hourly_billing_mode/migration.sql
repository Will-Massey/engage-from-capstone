-- Two ways to charge an hourly service.
-- ONE_OFF: a quoted block of hours, collected once.
-- MONTHLY_ACTUAL: an estimate of hours each month. The client is invoiced
-- later for the hours actually worked. This is not a fixed repeating amount.
-- Existing hourly rows stay null, which the application treats as ONE_OFF.
-- The new value is not written in this migration.

CREATE TYPE "HourlyBillingMode" AS ENUM ('ONE_OFF', 'MONTHLY_ACTUAL');

ALTER TABLE "ProposalService" ADD COLUMN "hourlyBillingMode" "HourlyBillingMode";
