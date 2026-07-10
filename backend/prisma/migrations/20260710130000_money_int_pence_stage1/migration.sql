-- Stage 1 of the Float → Int-pence money migration
-- (docs/money-int-pence-migration.md). Additive columns + idempotent
-- backfill; Float columns stay until Stage 2.

ALTER TABLE "Proposal"
  ADD COLUMN IF NOT EXISTS "subtotalPence" INTEGER,
  ADD COLUMN IF NOT EXISTS "discountAmountPence" INTEGER,
  ADD COLUMN IF NOT EXISTS "vatAmountPence" INTEGER,
  ADD COLUMN IF NOT EXISTS "totalPence" INTEGER;

ALTER TABLE "ProposalService"
  ADD COLUMN IF NOT EXISTS "displayPricePence" INTEGER,
  ADD COLUMN IF NOT EXISTS "unitPricePence" INTEGER,
  ADD COLUMN IF NOT EXISTS "annualEquivalentPence" INTEGER,
  ADD COLUMN IF NOT EXISTS "lineTotalPence" INTEGER,
  ADD COLUMN IF NOT EXISTS "vatAmountPence" INTEGER,
  ADD COLUMN IF NOT EXISTS "grossTotalPence" INTEGER;

-- Idempotent backfill (guarded for boot retries).
UPDATE "Proposal" SET
  "subtotalPence"       = ROUND("subtotal" * 100)::int,
  "discountAmountPence" = ROUND("discountAmount" * 100)::int,
  "vatAmountPence"      = ROUND("vatAmount" * 100)::int,
  "totalPence"          = ROUND("total" * 100)::int
WHERE "totalPence" IS NULL;

UPDATE "ProposalService" SET
  "displayPricePence"     = ROUND("displayPrice" * 100)::int,
  "unitPricePence"        = ROUND("unitPrice" * 100)::int,
  "annualEquivalentPence" = ROUND("annualEquivalent" * 100)::int,
  "lineTotalPence"        = ROUND("lineTotal" * 100)::int,
  "vatAmountPence"        = ROUND("vatAmount" * 100)::int,
  "grossTotalPence"       = ROUND("grossTotal" * 100)::int
WHERE "grossTotalPence" IS NULL;
