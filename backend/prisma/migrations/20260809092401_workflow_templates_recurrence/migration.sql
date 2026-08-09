-- CreateEnum
CREATE TYPE "RecurrenceCadence" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "RecurrenceAnchor" AS ENUM ('CLIENT_YEAR_END', 'CLIENT_VAT_DUE', 'CLIENT_ACCOUNTS_DUE', 'CLIENT_CONFIRMATION_DUE', 'SELF_ASSESSMENT', 'FIXED_DAY_OF_PERIOD');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "recurrenceId" TEXT;

-- CreateTable
CREATE TABLE "JobTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceCategory" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "JobTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTemplatePhase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "JobTemplatePhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTemplateChecklistItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "phaseId" TEXT NOT NULL,

    CONSTRAINT "JobTemplateChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRecurrence" (
    "id" TEXT NOT NULL,
    "cadence" "RecurrenceCadence" NOT NULL,
    "anchor" "RecurrenceAnchor" NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 14,
    "dayOfPeriod" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastPeriodKey" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assigneeId" TEXT,

    CONSTRAINT "JobRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobTemplate_tenantId_isActive_idx" ON "JobTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "JobTemplate_tenantId_name_key" ON "JobTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "JobTemplatePhase_templateId_idx" ON "JobTemplatePhase"("templateId");

-- CreateIndex
CREATE INDEX "JobTemplateChecklistItem_phaseId_idx" ON "JobTemplateChecklistItem"("phaseId");

-- CreateIndex
CREATE INDEX "JobRecurrence_tenantId_isActive_idx" ON "JobRecurrence"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "JobRecurrence_clientId_idx" ON "JobRecurrence"("clientId");

-- CreateIndex
CREATE INDEX "JobRecurrence_templateId_idx" ON "JobRecurrence"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_recurrenceId_periodKey_key" ON "Job"("recurrenceId", "periodKey");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "JobRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplatePhase" ADD CONSTRAINT "JobTemplatePhase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplateChecklistItem" ADD CONSTRAINT "JobTemplateChecklistItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "JobTemplatePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecurrence" ADD CONSTRAINT "JobRecurrence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecurrence" ADD CONSTRAINT "JobRecurrence_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecurrence" ADD CONSTRAINT "JobRecurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecurrence" ADD CONSTRAINT "JobRecurrence_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

