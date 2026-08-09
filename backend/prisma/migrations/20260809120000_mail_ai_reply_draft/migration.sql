CREATE TABLE IF NOT EXISTS "mail_ai_reply_drafts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientId" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentMessageId" TEXT,
    "generationMeta" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    CONSTRAINT "mail_ai_reply_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mail_ai_reply_drafts_inboundMessageId_key"
    ON "mail_ai_reply_drafts"("inboundMessageId");
CREATE INDEX IF NOT EXISTS "mail_ai_reply_drafts_tenantId_status_idx"
    ON "mail_ai_reply_drafts"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "mail_ai_reply_drafts_tenantId_conversationId_idx"
    ON "mail_ai_reply_drafts"("tenantId", "conversationId");
