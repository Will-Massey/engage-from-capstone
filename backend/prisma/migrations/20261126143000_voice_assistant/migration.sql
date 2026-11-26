-- Additive only. Voice assistant flag (off for every existing user),
-- per-session xAI usage, and voice changes waiting to be confirmed.
-- Does not alter proposal, signature, or payment columns.

ALTER TABLE "User"
  ADD COLUMN "voice_assistant_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "xai_usages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "billable_audio_seconds" DOUBLE PRECISION,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "rate_usd_per_minute" DOUBLE PRECISION,
    "estimated_cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xai_usages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "xai_usages_userId_started_at_idx" ON "xai_usages"("userId", "started_at");
CREATE INDEX "xai_usages_tenantId_started_at_idx" ON "xai_usages"("tenantId", "started_at");

ALTER TABLE "xai_usages"
  ADD CONSTRAINT "xai_usages_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "xai_usages"
  ADD CONSTRAINT "xai_usages_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "voice_pending_changes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "proposalId" TEXT,
    "summary" TEXT NOT NULL,
    "before_json" TEXT NOT NULL DEFAULT '{}',
    "after_json" TEXT NOT NULL DEFAULT '{}',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_pending_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_pending_changes_userId_status_expires_at_idx"
  ON "voice_pending_changes"("userId", "status", "expires_at");
CREATE INDEX "voice_pending_changes_tenantId_created_at_idx"
  ON "voice_pending_changes"("tenantId", "created_at");

ALTER TABLE "voice_pending_changes"
  ADD CONSTRAINT "voice_pending_changes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_pending_changes"
  ADD CONSTRAINT "voice_pending_changes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
