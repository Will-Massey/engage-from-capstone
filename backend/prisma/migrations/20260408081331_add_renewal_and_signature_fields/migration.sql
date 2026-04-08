/*
  Warnings:

  - You are about to drop the column `clientSignatoryName` on the `Proposal` table. All the data in the column will be lost.
  - You are about to drop the column `clientSignatoryPosition` on the `Proposal` table. All the data in the column will be lost.
  - You are about to drop the column `clientSignature` on the `Proposal` table. All the data in the column will be lost.
  - You are about to drop the column `clientSignedAt` on the `Proposal` table. All the data in the column will be lost.
  - You are about to drop the column `lastViewedAt` on the `Proposal` table. All the data in the column will be lost.
  - You are about to drop the column `signatoryName` on the `Proposal` table. All the data in the column will be lost.
  - You are about to drop the column `viewCount` on the `Proposal` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `emailQuota` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `storageQuota` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `Tenant` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CoverLetterTone" AS ENUM ('PROFESSIONAL', 'FRIENDLY', 'MODERN');

-- AlterEnum
ALTER TYPE "PricingModel" ADD VALUE 'PER_TRANSACTION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceCategory" ADD VALUE 'TECHNICAL';
ALTER TYPE "ServiceCategory" ADD VALUE 'SPECIALIZED';

-- AlterTable
ALTER TABLE "Proposal" DROP COLUMN "clientSignatoryName",
DROP COLUMN "clientSignatoryPosition",
DROP COLUMN "clientSignature",
DROP COLUMN "clientSignedAt",
DROP COLUMN "lastViewedAt",
DROP COLUMN "signatoryName",
DROP COLUMN "viewCount",
ADD COLUMN     "acceptanceNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "isRenewal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalProposalId" TEXT,
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "renewalReminderSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "renewalReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProposalSignature" ADD COLUMN     "signatureFilePath" TEXT,
ALTER COLUMN "signatureData" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "address",
DROP COLUMN "email",
DROP COLUMN "emailQuota",
DROP COLUMN "phone",
DROP COLUMN "storageQuota",
DROP COLUMN "website";

-- CreateTable
CREATE TABLE "CoverLetterTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tone" "CoverLetterTone" NOT NULL DEFAULT 'PROFESSIONAL',
    "content" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverLetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverLetterTemplate_tenantId_idx" ON "CoverLetterTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "CoverLetterTemplate_isDefault_idx" ON "CoverLetterTemplate"("isDefault");

-- AddForeignKey
ALTER TABLE "CoverLetterTemplate" ADD CONSTRAINT "CoverLetterTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
