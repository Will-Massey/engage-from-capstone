-- Several client entities in one practice may share a contact email.
-- This migration only drops the unique index and adds a non-unique lookup
-- index, plus a nullable Stripe customer id. It does not update, rewrite,
-- or delete any existing rows.

DROP INDEX IF EXISTS "Client_tenantId_contactEmail_key";

CREATE INDEX IF NOT EXISTS "Client_tenantId_contactEmail_idx"
  ON "Client"("tenantId", "contactEmail");

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_stripeCustomerId_key"
  ON "Client"("stripeCustomerId");
