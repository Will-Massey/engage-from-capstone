/*
  Warnings:

  - The `billingFrequency` column on the `ProposalService` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `priceDisplayMode` column on the `ServiceTemplate` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `vatRate` on table `ProposalService` required. This step will fail if there are existing NULL values in that column.
  - Made the column `priceDisplayMode` on table `ProposalService` required. This step will fail if there are existing NULL values in that column.
  - Made the column `priceAmount` on table `ServiceTemplate` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "JobBoardColumn" AS ENUM ('REQUEST_RECORDS', 'RECORDS_RECEIVED', 'IN_PROGRESS', 'HELP_NEEDED', 'IN_REVIEW', 'COMPLETE');

-- CreateEnum
CREATE TYPE "JobDeadlineKind" AS ENUM ('STATUTORY', 'INTERNAL', 'NONE');

-- DropIndex
DROP INDEX "Proposal_declineReason_idx";

-- DropIndex
DROP INDEX "Proposal_paymentMandateId_idx";

-- DropIndex
DROP INDEX "ProposalService_vatRate_idx";

-- DropIndex
DROP INDEX "ServiceTemplate_billingCycle_idx";

-- DropIndex
DROP INDEX "ServiceTemplate_priceDisplayMode_idx";

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "lifecycleStage" SET DEFAULT 'PROSPECT';

-- AlterTable
ALTER TABLE "ProposalService" ALTER COLUMN "vatRate" SET NOT NULL,
DROP COLUMN "billingFrequency",
ADD COLUMN     "billingFrequency" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ALTER COLUMN "priceDisplayMode" SET NOT NULL;

-- AlterTable
ALTER TABLE "ServiceTemplate" ALTER COLUMN "priceAmount" SET NOT NULL,
ALTER COLUMN "priceAmount" SET DEFAULT 0,
DROP COLUMN "priceDisplayMode",
ADD COLUMN     "priceDisplayMode" "PriceDisplayMode" NOT NULL DEFAULT 'PER_MONTH';

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

-- CreateIndex
CREATE INDEX "Client_lifecycleStage_idx" ON "Client"("lifecycleStage");

-- CreateIndex
CREATE INDEX "ProposalService_billingFrequency_idx" ON "ProposalService"("billingFrequency");

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
