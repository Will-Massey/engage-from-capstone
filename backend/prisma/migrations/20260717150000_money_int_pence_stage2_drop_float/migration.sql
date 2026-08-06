-- Stage 2 of the Float → Int-pence money migration
-- (docs/money-int-pence-migration.md). Pence columns become authoritative
-- and required; the stale Float columns are dropped. Prod verified
-- 2026-07-17: zero NULL pence, zero drift vs ROUND(float*100).

-- Safety net for any row missed by the Stage 1 backfill (e.g. created by a
-- pre-Stage-1 instance during a rolling deploy).
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

ALTER TABLE "Proposal"
  ALTER COLUMN "subtotalPence" SET NOT NULL,
  ALTER COLUMN "subtotalPence" SET DEFAULT 0,
  ALTER COLUMN "discountAmountPence" SET NOT NULL,
  ALTER COLUMN "discountAmountPence" SET DEFAULT 0,
  ALTER COLUMN "vatAmountPence" SET NOT NULL,
  ALTER COLUMN "vatAmountPence" SET DEFAULT 0,
  ALTER COLUMN "totalPence" SET NOT NULL,
  ALTER COLUMN "totalPence" SET DEFAULT 0;

ALTER TABLE "ProposalService"
  ALTER COLUMN "displayPricePence" SET NOT NULL,
  ALTER COLUMN "unitPricePence" SET NOT NULL,
  ALTER COLUMN "annualEquivalentPence" SET NOT NULL,
  ALTER COLUMN "annualEquivalentPence" SET DEFAULT 0,
  ALTER COLUMN "lineTotalPence" SET NOT NULL,
  ALTER COLUMN "vatAmountPence" SET NOT NULL,
  ALTER COLUMN "vatAmountPence" SET DEFAULT 0,
  ALTER COLUMN "grossTotalPence" SET NOT NULL,
  ALTER COLUMN "grossTotalPence" SET DEFAULT 0;

ALTER TABLE "Proposal"
  DROP COLUMN IF EXISTS "subtotal",
  DROP COLUMN IF EXISTS "discountAmount",
  DROP COLUMN IF EXISTS "vatAmount",
  DROP COLUMN IF EXISTS "total";

ALTER TABLE "ProposalService"
  DROP COLUMN IF EXISTS "displayPrice",
  DROP COLUMN IF EXISTS "unitPrice",
  DROP COLUMN IF EXISTS "annualEquivalent",
  DROP COLUMN IF EXISTS "lineTotal",
  DROP COLUMN IF EXISTS "vatAmount",
  DROP COLUMN IF EXISTS "grossTotal";
