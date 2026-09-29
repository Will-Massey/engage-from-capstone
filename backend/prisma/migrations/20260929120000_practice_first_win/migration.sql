-- Additive: record each practice's first sent proposal or engagement letter.
-- Signup time is already Tenant.createdAt (set once at insert, never rewritten).
-- Applied on deploy by `prisma migrate deploy` in backend/start-prod.mjs before the server listens.
-- Does not drop or rewrite existing columns.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "firstWinAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "firstWinKind" TEXT;

CREATE INDEX IF NOT EXISTS "Tenant_createdAt_idx" ON "Tenant"("createdAt");
CREATE INDEX IF NOT EXISTS "Tenant_firstWinAt_idx" ON "Tenant"("firstWinAt");

-- Backfill from the earliest accurate send timestamp already stored.
-- Proposal.sentAt covers proposals and letters of engagement (loe_only).
-- Client.engagementLetterSentAt covers the post-acceptance engagement-letter email.
-- Rows with a sent status but a null timestamp are left alone (no accurate time).
WITH events AS (
  SELECT
    "tenantId",
    "sentAt" AS win_at,
    CASE
      WHEN "customFields" ~ '"proposalType"\s*:\s*"loe_only"' THEN 'engagement_letter'
      ELSE 'proposal'
    END AS kind
  FROM "Proposal"
  WHERE "sentAt" IS NOT NULL
  UNION ALL
  SELECT
    "tenantId",
    "engagementLetterSentAt" AS win_at,
    'engagement_letter' AS kind
  FROM "Client"
  WHERE "engagementLetterSentAt" IS NOT NULL
),
earliest AS (
  SELECT DISTINCT ON ("tenantId")
    "tenantId",
    win_at,
    kind
  FROM events
  ORDER BY "tenantId", win_at ASC, kind ASC
)
UPDATE "Tenant" AS t
SET
  "firstWinAt" = e.win_at,
  "firstWinKind" = e.kind
FROM earliest AS e
WHERE t.id = e."tenantId"
  AND t."firstWinAt" IS NULL;
