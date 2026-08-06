/*
  Practice jobs + schema alignment.

  SAFE for Caroline production:
  - Do NOT drop/recreate billingFrequency or priceDisplayMode (would wipe fees).
  - Cast TEXT → enum in place when needed; leave alone if already enum.
  - Backfill NULLs before SET NOT NULL.
*/
-- CreateEnum
CREATE TYPE "JobBoardColumn" AS ENUM ('REQUEST_RECORDS', 'RECORDS_RECEIVED', 'IN_PROGRESS', 'HELP_NEEDED', 'IN_REVIEW', 'COMPLETE');

-- CreateEnum
CREATE TYPE "JobDeadlineKind" AS ENUM ('STATUTORY', 'INTERNAL', 'NONE');

-- DropIndex (ignore if already gone)
DROP INDEX IF EXISTS "Proposal_declineReason_idx";
DROP INDEX IF EXISTS "Proposal_paymentMandateId_idx";
DROP INDEX IF EXISTS "ProposalService_vatRate_idx";
DROP INDEX IF EXISTS "ServiceTemplate_billingCycle_idx";
DROP INDEX IF EXISTS "ServiceTemplate_priceDisplayMode_idx";

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "lifecycleStage" SET DEFAULT 'PROSPECT';

-- ProposalService: fill nulls, then tighten NOT NULL; cast billingFrequency TEXT→BillingCycle without data loss
UPDATE "ProposalService" SET "vatRate" = 20 WHERE "vatRate" IS NULL;
UPDATE "ProposalService" SET "priceDisplayMode" = 'PER_MONTH' WHERE "priceDisplayMode" IS NULL;
ALTER TABLE "ProposalService" ALTER COLUMN "vatRate" SET NOT NULL;
ALTER TABLE "ProposalService" ALTER COLUMN "priceDisplayMode" SET NOT NULL;

DO $$
BEGIN
  -- Only rewrite when still TEXT (prod from 20260410 overhaul). Skip if already BillingCycle.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ProposalService'
      AND column_name = 'billingFrequency' AND data_type = 'text'
  ) THEN
    ALTER TABLE "ProposalService"
      ALTER COLUMN "billingFrequency" DROP DEFAULT,
      ALTER COLUMN "billingFrequency" TYPE "BillingCycle"
        USING (
          CASE upper(coalesce("billingFrequency", 'MONTHLY'))
            WHEN 'FIXED_DATE' THEN 'FIXED_DATE'::"BillingCycle"
            WHEN 'WEEKLY' THEN 'WEEKLY'::"BillingCycle"
            WHEN 'MONTHLY' THEN 'MONTHLY'::"BillingCycle"
            WHEN 'QUARTERLY' THEN 'QUARTERLY'::"BillingCycle"
            WHEN 'ANNUALLY' THEN 'ANNUALLY'::"BillingCycle"
            WHEN 'ONE_TIME' THEN 'ONE_TIME'::"BillingCycle"
            ELSE 'MONTHLY'::"BillingCycle"
          END
        ),
      ALTER COLUMN "billingFrequency" SET DEFAULT 'MONTHLY'::"BillingCycle",
      ALTER COLUMN "billingFrequency" SET NOT NULL;
  END IF;
END $$;

-- ServiceTemplate: fill null priceAmount; cast priceDisplayMode TEXT→enum without data loss
UPDATE "ServiceTemplate" SET "priceAmount" = 0 WHERE "priceAmount" IS NULL;
ALTER TABLE "ServiceTemplate" ALTER COLUMN "priceAmount" SET DEFAULT 0;
ALTER TABLE "ServiceTemplate" ALTER COLUMN "priceAmount" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ServiceTemplate'
      AND column_name = 'priceDisplayMode' AND data_type = 'text'
  ) THEN
    ALTER TABLE "ServiceTemplate"
      ALTER COLUMN "priceDisplayMode" DROP DEFAULT,
      ALTER COLUMN "priceDisplayMode" TYPE "PriceDisplayMode"
        USING (
          CASE upper(coalesce("priceDisplayMode", 'PER_MONTH'))
            WHEN 'PER_MONTH' THEN 'PER_MONTH'::"PriceDisplayMode"
            WHEN 'PER_QUARTER' THEN 'PER_QUARTER'::"PriceDisplayMode"
            WHEN 'PER_YEAR' THEN 'PER_YEAR'::"PriceDisplayMode"
            WHEN 'ONE_TIME' THEN 'ONE_TIME'::"PriceDisplayMode"
            WHEN 'PER_HOUR' THEN 'PER_HOUR'::"PriceDisplayMode"
            WHEN 'PER_UNIT' THEN 'PER_UNIT'::"PriceDisplayMode"
            ELSE 'PER_MONTH'::"PriceDisplayMode"
          END
        ),
      ALTER COLUMN "priceDisplayMode" SET DEFAULT 'PER_MONTH'::"PriceDisplayMode",
      ALTER COLUMN "priceDisplayMode" SET NOT NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ServiceTemplate'
      AND column_name = 'priceDisplayMode'
  ) THEN
    UPDATE "ServiceTemplate" SET "priceDisplayMode" = 'PER_MONTH' WHERE "priceDisplayMode" IS NULL;
    ALTER TABLE "ServiceTemplate" ALTER COLUMN "priceDisplayMode" SET NOT NULL;
  END IF;
END $$;

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "boardColumn" "JobBoardColumn" NOT NULL DEFAULT 'REQUEST_RECORDS',
    "deadlineKind" "JobDeadlineKind" NOT NULL DEFAULT 'NONE',
    "dueAt" TIMESTAMP(3),
    "proposedFeePence" INTEGER NOT NULL DEFAULT 0,
    "budgetPence" INTEGER NOT NULL DEFAULT 0,
    "actualPence" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "proposalId" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPhase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "jobId" TEXT NOT NULL,
    "proposalServiceId" TEXT,
    "serviceCategory" TEXT,

    CONSTRAINT "JobPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "phaseId" TEXT NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "phaseId" TEXT,
    "assigneeId" TEXT,

    CONSTRAINT "JobTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "ratePence" INTEGER NOT NULL DEFAULT 0,
    "amountPence" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "phaseId" TEXT,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT,

    CONSTRAINT "PortalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "actorId" TEXT,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_proposalId_key" ON "Job"("proposalId");

-- CreateIndex
CREATE INDEX "Job_tenantId_idx" ON "Job"("tenantId");

-- CreateIndex
CREATE INDEX "Job_tenantId_boardColumn_idx" ON "Job"("tenantId", "boardColumn");

-- CreateIndex
CREATE INDEX "Job_clientId_idx" ON "Job"("clientId");

-- CreateIndex
CREATE INDEX "Job_assigneeId_idx" ON "Job"("assigneeId");

-- CreateIndex
CREATE INDEX "Job_dueAt_idx" ON "Job"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_tenantId_reference_key" ON "Job"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "JobPhase_jobId_idx" ON "JobPhase"("jobId");

-- CreateIndex
CREATE INDEX "JobPhase_proposalServiceId_idx" ON "JobPhase"("proposalServiceId");

-- CreateIndex
CREATE INDEX "ChecklistItem_phaseId_idx" ON "ChecklistItem"("phaseId");

-- CreateIndex
CREATE INDEX "JobTask_jobId_idx" ON "JobTask"("jobId");

-- CreateIndex
CREATE INDEX "JobTask_phaseId_idx" ON "JobTask"("phaseId");

-- CreateIndex
CREATE INDEX "JobTask_assigneeId_idx" ON "JobTask"("assigneeId");

-- CreateIndex
CREATE INDEX "TimeEntry_jobId_idx" ON "TimeEntry"("jobId");

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_idx" ON "TimeEntry"("tenantId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_idx" ON "TimeEntry"("userId");

-- CreateIndex
CREATE INDEX "TimeEntry_phaseId_idx" ON "TimeEntry"("phaseId");

-- CreateIndex
CREATE INDEX "PortalFile_tenantId_idx" ON "PortalFile"("tenantId");

-- CreateIndex
CREATE INDEX "PortalFile_clientId_idx" ON "PortalFile"("clientId");

-- CreateIndex
CREATE INDEX "PortalFile_jobId_idx" ON "PortalFile"("jobId");

-- CreateIndex
CREATE INDEX "JobActivity_jobId_idx" ON "JobActivity"("jobId");

-- CreateIndex
CREATE INDEX "JobActivity_createdAt_idx" ON "JobActivity"("createdAt");

-- CreateIndex (may already exist from earlier migrations on prod / CI)
CREATE INDEX IF NOT EXISTS "Client_lifecycleStage_idx" ON "Client"("lifecycleStage");

-- CreateIndex (created by 20260410 overhaul — do not fail if present)
CREATE INDEX IF NOT EXISTS "ProposalService_billingFrequency_idx" ON "ProposalService"("billingFrequency");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhase" ADD CONSTRAINT "JobPhase_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "JobPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "JobPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "JobPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalFile" ADD CONSTRAINT "PortalFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalFile" ADD CONSTRAINT "PortalFile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalFile" ADD CONSTRAINT "PortalFile_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
