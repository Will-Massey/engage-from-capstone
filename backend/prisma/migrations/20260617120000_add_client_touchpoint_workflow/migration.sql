-- Add Client Touchpoint / Lifecycle Workflow tables and enums
-- Safe to run multiple times where possible (idempotent where noted)

-- Enums (PostgreSQL allows ADD VALUE if not exists via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clientlifecyclestage') THEN
    CREATE TYPE "ClientLifecycleStage" AS ENUM (
      'PROPOSAL_ACCEPTED','AML_PENDING','AML_COMPLETE','ENGAGEMENT_LETTER_SENT',
      'ENGAGEMENT_LETTER_SIGNED','INFO_REQUESTED','INFO_RECEIVED','ONBOARDING_SETUP',
      'KICKOFF_SENT','MILESTONE_CHECK_IN','SATISFACTION_CHECK','ONGOING','ANNUAL_REVIEW'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'touchpointstatus') THEN
    CREATE TYPE "TouchpointStatus" AS ENUM ('PENDING','SENT','SKIPPED','PAUSED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'touchpointtriggertype') THEN
    CREATE TYPE "TouchpointTriggerType" AS ENUM ('EVENT','TIME_DELAY');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'touchpointchannel') THEN
    CREATE TYPE "TouchpointChannel" AS ENUM ('EMAIL','SMS','IN_APP');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'touchpointtone') THEN
    CREATE TYPE "TouchpointTone" AS ENUM ('WARM','NEUTRAL','URGENT');
  END IF;
END $$;

-- Extend Client table
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "lifecycleStage" "ClientLifecycleStage" NOT NULL DEFAULT 'PROPOSAL_ACCEPTED';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "touchpointsPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "nextVatDueDate" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "nextAccountsDueDate" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "nextConfirmationStatementDue" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "amlCompletedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "engagementLetterSentAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "engagementLetterSignedAt" TIMESTAMP(3);

-- New tables
CREATE TABLE IF NOT EXISTS "TouchpointTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "stage" "ClientLifecycleStage" NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "tone" "TouchpointTone" NOT NULL DEFAULT 'WARM',
  "isMarketing" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TouchpointTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TouchpointTemplate_tenantId_stage_key" ON "TouchpointTemplate"("tenantId", "stage");
CREATE INDEX IF NOT EXISTS "TouchpointTemplate_tenantId_idx" ON "TouchpointTemplate"("tenantId");
CREATE INDEX IF NOT EXISTS "TouchpointTemplate_stage_idx" ON "TouchpointTemplate"("stage");
CREATE INDEX IF NOT EXISTS "TouchpointTemplate_isActive_idx" ON "TouchpointTemplate"("isActive");

CREATE TABLE IF NOT EXISTS "Touchpoint" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "stage" "ClientLifecycleStage" NOT NULL,
  "triggerType" "TouchpointTriggerType" NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "TouchpointStatus" NOT NULL DEFAULT 'PENDING',
  "channel" "TouchpointChannel" NOT NULL DEFAULT 'EMAIL',
  "templateId" TEXT,
  "sentAt" TIMESTAMP(3),
  "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Touchpoint_clientId_idx" ON "Touchpoint"("clientId");
CREATE INDEX IF NOT EXISTS "Touchpoint_tenantId_idx" ON "Touchpoint"("tenantId");
CREATE INDEX IF NOT EXISTS "Touchpoint_status_idx" ON "Touchpoint"("status");
CREATE INDEX IF NOT EXISTS "Touchpoint_scheduledFor_idx" ON "Touchpoint"("scheduledFor");
CREATE INDEX IF NOT EXISTS "Touchpoint_requiresHumanApproval_idx" ON "Touchpoint"("requiresHumanApproval");

-- Foreign keys
ALTER TABLE "TouchpointTemplate" ADD CONSTRAINT "TouchpointTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "TouchpointTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add relation columns on Tenant if not present (defensive)
-- (relations are handled by Prisma, no extra columns needed)

-- Backfill existing clients to PROPOSAL_ACCEPTED if they have accepted proposals (optional, safe)
UPDATE "Client" c
SET "lifecycleStage" = 'PROPOSAL_ACCEPTED'
WHERE "lifecycleStage" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Proposal" p
    WHERE p."clientId" = c.id AND p.status = 'ACCEPTED'
  );
