-- Capstone mesh: optional AccountFlow linkage (safe additive columns)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "capstoneClientId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "accountFlowClientId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "accountFlowLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Client_capstoneClientId_key" ON "Client"("capstoneClientId");

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "accountFlowWorkId" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "accountFlowSyncStatus" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "accountFlowLastSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Job_accountFlowWorkId_idx" ON "Job"("accountFlowWorkId");
