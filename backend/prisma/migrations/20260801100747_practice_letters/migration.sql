-- CreateEnum
CREATE TYPE "PracticeLetterType" AS ENUM ('DISENGAGEMENT', 'PROFESSIONAL_CLEARANCE', 'HMRC_64_8');

-- CreateEnum
CREATE TYPE "PracticeLetterStatus" AS ENUM ('DRAFT', 'SENT', 'ARCHIVED');

-- CreateTable
CREATE TABLE "PracticeLetter" (
    "id" TEXT NOT NULL,
    "type" "PracticeLetterType" NOT NULL,
    "status" "PracticeLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "PracticeLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeLetter_tenantId_idx" ON "PracticeLetter"("tenantId");

-- CreateIndex
CREATE INDEX "PracticeLetter_clientId_idx" ON "PracticeLetter"("clientId");

-- CreateIndex
CREATE INDEX "PracticeLetter_type_idx" ON "PracticeLetter"("type");

-- CreateIndex
CREATE INDEX "PracticeLetter_status_idx" ON "PracticeLetter"("status");

-- AddForeignKey
ALTER TABLE "PracticeLetter" ADD CONSTRAINT "PracticeLetter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeLetter" ADD CONSTRAINT "PracticeLetter_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeLetter" ADD CONSTRAINT "PracticeLetter_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeLetter" ADD CONSTRAINT "PracticeLetter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
