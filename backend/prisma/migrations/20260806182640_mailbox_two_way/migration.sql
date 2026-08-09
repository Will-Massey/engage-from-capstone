-- CreateEnum
CREATE TYPE "MailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "conversationId" TEXT,
    "internetMessageId" TEXT,
    "direction" "MailDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT NOT NULL,
    "ccAddresses" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT,
    "snippet" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "jobId" TEXT,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAttachment" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "MailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxSyncState" (
    "id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "inboxDeltaLink" TEXT,
    "sentDeltaLink" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncOk" BOOLEAN,
    "lastSyncError" TEXT,
    "subscriptionId" TEXT,
    "subscriptionExpiry" TIMESTAMP(3),
    "clientState" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "MailboxSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailMessage_tenantId_receivedAt_idx" ON "MailMessage"("tenantId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "MailMessage_tenantId_conversationId_idx" ON "MailMessage"("tenantId", "conversationId");

-- CreateIndex
CREATE INDEX "MailMessage_tenantId_isRead_idx" ON "MailMessage"("tenantId", "isRead");

-- CreateIndex
CREATE INDEX "MailMessage_clientId_idx" ON "MailMessage"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_tenantId_provider_externalId_key" ON "MailMessage"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "MailAttachment_messageId_idx" ON "MailAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxSyncState_tenantId_key" ON "MailboxSyncState"("tenantId");

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxSyncState" ADD CONSTRAINT "MailboxSyncState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate legacy ActivityLog-based mailbox rows into MailMessage.
-- Guarded so a malformed metadata row cannot fail the boot migration (fail-closed runner).
DO $$
BEGIN
  INSERT INTO "MailMessage" ("id","provider","externalId","direction","fromAddress","toAddresses","subject","bodyText","isRead","receivedAt","createdAt","updatedAt","tenantId","conversationId")
  SELECT gen_random_uuid(),
         'SMTP'::"EmailProvider",
         COALESCE(NULLIF(al.metadata::json->>'externalId',''), al.id),
         CASE WHEN al.action = 'EMAIL_OUTBOUND' THEN 'OUTBOUND'::"MailDirection" ELSE 'INBOUND'::"MailDirection" END,
         COALESCE(al.metadata::json->>'from',''),
         COALESCE(al.metadata::json->>'to',''),
         COALESCE(al.metadata::json->>'subject','(no subject)'),
         COALESCE(al.metadata::json->>'body',''),
         COALESCE((al.metadata::json->>'read')::boolean, false),
         al."createdAt", al."createdAt", al."createdAt",
         al."tenantId",
         NULLIF(al.metadata::json->>'threadKey','')
  FROM "ActivityLog" al
  WHERE al.action IN ('EMAIL_INBOUND','EMAIL_OUTBOUND')
    AND al.metadata IS NOT NULL AND al.metadata <> '{}'
    AND al.metadata::text LIKE '{%'
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'MailMessage backfill skipped due to error: %', SQLERRM;
END $$;
