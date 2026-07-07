-- Stage 0.5 of the Int-pence money migration (docs/money-int-pence-migration.md):
-- round legacy float dust in stored money to whole pence. New writes are already
-- rounded at the persistence boundary (proposalPricing, "Stage 0"); this cleans
-- rows written before that. Representation-only: values move by < half a penny.
-- Raw inputs that are not money amounts (vatRate, quantity, discountPercent,
-- discountValue [dual-mode percent/absolute], baseHours) are left untouched.

UPDATE "Proposal" SET
  "subtotal"       = ROUND("subtotal"::numeric, 2)::double precision,
  "discountAmount" = ROUND("discountAmount"::numeric, 2)::double precision,
  "vatAmount"      = ROUND("vatAmount"::numeric, 2)::double precision,
  "total"          = ROUND("total"::numeric, 2)::double precision
WHERE "subtotal"       <> ROUND("subtotal"::numeric, 2)::double precision
   OR "discountAmount" <> ROUND("discountAmount"::numeric, 2)::double precision
   OR "vatAmount"      <> ROUND("vatAmount"::numeric, 2)::double precision
   OR "total"          <> ROUND("total"::numeric, 2)::double precision;

UPDATE "ProposalService" SET
  "displayPrice"     = ROUND("displayPrice"::numeric, 2)::double precision,
  "unitPrice"        = ROUND("unitPrice"::numeric, 2)::double precision,
  "lineTotal"        = ROUND("lineTotal"::numeric, 2)::double precision,
  "vatAmount"        = ROUND("vatAmount"::numeric, 2)::double precision,
  "grossTotal"       = ROUND("grossTotal"::numeric, 2)::double precision,
  "annualEquivalent" = ROUND("annualEquivalent"::numeric, 2)::double precision
WHERE "displayPrice"     <> ROUND("displayPrice"::numeric, 2)::double precision
   OR "unitPrice"        <> ROUND("unitPrice"::numeric, 2)::double precision
   OR "lineTotal"        <> ROUND("lineTotal"::numeric, 2)::double precision
   OR "vatAmount"        <> ROUND("vatAmount"::numeric, 2)::double precision
   OR "grossTotal"       <> ROUND("grossTotal"::numeric, 2)::double precision
   OR "annualEquivalent" <> ROUND("annualEquivalent"::numeric, 2)::double precision;

UPDATE "ServiceTemplate" SET
  "priceAmount"      = ROUND("priceAmount"::numeric, 2)::double precision,
  "basePrice"        = ROUND("basePrice"::numeric, 2)::double precision,
  "annualEquivalent" = ROUND("annualEquivalent"::numeric, 2)::double precision
WHERE "priceAmount" <> ROUND("priceAmount"::numeric, 2)::double precision
   OR "basePrice"   <> ROUND("basePrice"::numeric, 2)::double precision
   OR ("annualEquivalent" IS NOT NULL
       AND "annualEquivalent" <> ROUND("annualEquivalent"::numeric, 2)::double precision);
