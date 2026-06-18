-- Email delivery logging and suppression for multi-tenant mailer

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailMessageType') THEN
    CREATE TYPE "EmailMessageType" AS ENUM ('PROPOSAL', 'ACCEPTANCE', 'TOUCHPOINT', 'RENEWAL', 'FOLLOW_UP', 'TEST', 'OTHER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailProvider') THEN
    CREATE TYPE "EmailProvider" AS ENUM ('SENDGRID', 'SMTP', 'GMAIL', 'OUTLOOK', 'MICROSOFT365');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailDeliveryStatus') THEN
    CREATE TYPE "EmailDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'SUPPRESSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT,
  "proposalId" TEXT,
  "touchpointId" TEXT,
  "messageType" "EmailMessageType" NOT NULL,
  "provider" "EmailProvider" NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "to" TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "replyTo" TEXT,
  "subject" TEXT NOT NULL,
  "externalId" TEXT,
  "error" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailSuppression" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailSuppression_tenantId_email_key" ON "EmailSuppression"("tenantId", "email");
CREATE INDEX IF NOT EXISTS "EmailLog_tenantId_idx" ON "EmailLog"("tenantId");
CREATE INDEX IF NOT EXISTS "EmailLog_clientId_idx" ON "EmailLog"("clientId");
CREATE INDEX IF NOT EXISTS "EmailLog_proposalId_idx" ON "EmailLog"("proposalId");
CREATE INDEX IF NOT EXISTS "EmailLog_touchpointId_idx" ON "EmailLog"("touchpointId");
CREATE INDEX IF NOT EXISTS "EmailLog_status_idx" ON "EmailLog"("status");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_externalId_idx" ON "EmailLog"("externalId");
CREATE INDEX IF NOT EXISTS "EmailSuppression_tenantId_idx" ON "EmailSuppression"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailLog_tenantId_fkey') THEN
    ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailLog_clientId_fkey') THEN
    ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailLog_proposalId_fkey') THEN
    ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailLog_touchpointId_fkey') THEN
    ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_touchpointId_fkey" FOREIGN KEY ("touchpointId") REFERENCES "Touchpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailSuppression_tenantId_fkey') THEN
    ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
