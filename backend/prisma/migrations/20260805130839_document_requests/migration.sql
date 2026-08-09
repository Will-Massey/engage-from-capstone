-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('OPEN', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentRequestItemStatus" AS ENUM ('PENDING', 'RECEIVED');

-- AlterTable
ALTER TABLE "PortalFile" ADD COLUMN     "requestItemId" TEXT;

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'OPEN',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequestItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "DocumentRequestItemStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "DocumentRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentRequest_tenantId_status_idx" ON "DocumentRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DocumentRequest_clientId_idx" ON "DocumentRequest"("clientId");

-- CreateIndex
CREATE INDEX "DocumentRequest_jobId_idx" ON "DocumentRequest"("jobId");

-- CreateIndex
CREATE INDEX "DocumentRequestItem_requestId_idx" ON "DocumentRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "PortalFile_requestItemId_idx" ON "PortalFile"("requestItemId");

-- AddForeignKey
ALTER TABLE "PortalFile" ADD CONSTRAINT "PortalFile_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "DocumentRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequestItem" ADD CONSTRAINT "DocumentRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DocumentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
