-- Per-user bearer tokens for the Grok draft connector, plus an audit row
-- for every change those tokens make. The plaintext token is never stored.

CREATE TABLE "grok_connector_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Grok Bot',
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'read,draft_proposals',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "grok_connector_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grok_connector_tokens_keyHash_key" ON "grok_connector_tokens"("keyHash");
CREATE INDEX "grok_connector_tokens_userId_revoked_at_idx" ON "grok_connector_tokens"("userId", "revoked_at");
CREATE INDEX "grok_connector_tokens_tenantId_revoked_at_idx" ON "grok_connector_tokens"("tenantId", "revoked_at");

ALTER TABLE "grok_connector_tokens"
  ADD CONSTRAINT "grok_connector_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grok_connector_tokens"
  ADD CONSTRAINT "grok_connector_tokens_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "grok_connector_audits" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT,
    "tool" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grok_connector_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grok_connector_audits_tokenId_idx" ON "grok_connector_audits"("tokenId");
CREATE INDEX "grok_connector_audits_userId_created_at_idx" ON "grok_connector_audits"("userId", "created_at");
CREATE INDEX "grok_connector_audits_proposalId_idx" ON "grok_connector_audits"("proposalId");
CREATE INDEX "grok_connector_audits_tenantId_created_at_idx" ON "grok_connector_audits"("tenantId", "created_at");

ALTER TABLE "grok_connector_audits"
  ADD CONSTRAINT "grok_connector_audits_tokenId_fkey"
  FOREIGN KEY ("tokenId") REFERENCES "grok_connector_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
