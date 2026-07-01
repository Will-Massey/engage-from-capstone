-- CreateTable
CREATE TABLE "EngagementLibraryVersion" (
    "id" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changelog" TEXT NOT NULL DEFAULT '',
    "clausesJson" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementLibraryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngagementLibraryVersion_versionLabel_key" ON "EngagementLibraryVersion"("versionLabel");

-- CreateIndex
CREATE INDEX "EngagementLibraryVersion_isCurrent_idx" ON "EngagementLibraryVersion"("isCurrent");

-- CreateIndex
CREATE INDEX "EngagementLibraryVersion_publishedAt_idx" ON "EngagementLibraryVersion"("publishedAt");

-- AlterTable
ALTER TABLE "ProposalTemplate" ADD COLUMN "engagementLibraryVersionId" TEXT,
ADD COLUMN "needsUpdate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CoverLetterTemplate" ADD COLUMN "engagementLibraryVersionId" TEXT,
ADD COLUMN "needsUpdate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ProposalTemplate_needsUpdate_idx" ON "ProposalTemplate"("needsUpdate");

-- CreateIndex
CREATE INDEX "ProposalTemplate_engagementLibraryVersionId_idx" ON "ProposalTemplate"("engagementLibraryVersionId");

-- CreateIndex
CREATE INDEX "CoverLetterTemplate_needsUpdate_idx" ON "CoverLetterTemplate"("needsUpdate");

-- CreateIndex
CREATE INDEX "CoverLetterTemplate_engagementLibraryVersionId_idx" ON "CoverLetterTemplate"("engagementLibraryVersionId");

-- AddForeignKey
ALTER TABLE "ProposalTemplate" ADD CONSTRAINT "ProposalTemplate_engagementLibraryVersionId_fkey" FOREIGN KEY ("engagementLibraryVersionId") REFERENCES "EngagementLibraryVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetterTemplate" ADD CONSTRAINT "CoverLetterTemplate_engagementLibraryVersionId_fkey" FOREIGN KEY ("engagementLibraryVersionId") REFERENCES "EngagementLibraryVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;