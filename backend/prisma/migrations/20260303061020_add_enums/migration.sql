/*
  Warnings:

  - The `companyType` column on the `Client` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `mtditsaStatus` column on the `Client` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Proposal` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paymentFrequency` column on the `Proposal` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `frequency` column on the `ProposalService` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `pricingModel` column on the `ServiceTemplate` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `defaultFrequency` column on the `ServiceTemplate` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `annualEquivalent` on the `ServiceTemplate` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `DoublePrecision`.
  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `termsAccepted` on table `Proposal` required. This step will fail if there are existing NULL values in that column.
  - Made the column `publicAccessEnabled` on table `Proposal` required. This step will fail if there are existing NULL values in that column.
  - Made the column `emailHistory` on table `Proposal` required. This step will fail if there are existing NULL values in that column.
  - Made the column `completed` on table `ProposalView` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `category` on the `ServiceTemplate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `billingCycle` on table `ServiceTemplate` required. This step will fail if there are existing NULL values in that column.
  - Made the column `vatRate` on table `ServiceTemplate` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isVatApplicable` on table `ServiceTemplate` required. This step will fail if there are existing NULL values in that column.
  - Made the column `vatRegistered` on table `Tenant` required. This step will fail if there are existing NULL values in that column.
  - Made the column `defaultVatRate` on table `Tenant` required. This step will fail if there are existing NULL values in that column.
  - Made the column `autoApplyVat` on table `Tenant` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('SOLE_TRADER', 'PARTNERSHIP', 'LIMITED_COMPANY', 'LLP', 'CHARITY', 'NON_PROFIT');

-- CreateEnum
CREATE TYPE "MTDITSAStatus" AS ENUM ('NOT_REQUIRED', 'ELIGIBLE', 'MANDATORY', 'OPTED_IN', 'EXEMPT', 'REQUIRED_2026', 'REQUIRED_2027', 'REQUIRED_2028');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PricingFrequency" AS ENUM ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('COMPLIANCE', 'ADVISORY', 'TAX', 'PAYROLL', 'BOOKKEEPING', 'AUDIT', 'CONSULTING');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'HOURLY', 'TIERED', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "ProposalSignature" DROP CONSTRAINT "ProposalSignature_proposalId_fkey";

-- DropForeignKey
ALTER TABLE "ProposalView" DROP CONSTRAINT "ProposalView_proposalId_fkey";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "companyType",
ADD COLUMN     "companyType" "CompanyType" NOT NULL DEFAULT 'SOLE_TRADER',
DROP COLUMN "mtditsaStatus",
ADD COLUMN     "mtditsaStatus" "MTDITSAStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- AlterTable
ALTER TABLE "Proposal" DROP COLUMN "status",
ADD COLUMN     "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
DROP COLUMN "paymentFrequency",
ADD COLUMN     "paymentFrequency" "PricingFrequency" NOT NULL DEFAULT 'MONTHLY',
ALTER COLUMN "termsAccepted" SET NOT NULL,
ALTER COLUMN "termsAcceptedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "shareTokenExpiry" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "publicAccessEnabled" SET NOT NULL,
ALTER COLUMN "lastEmailedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "emailHistory" SET NOT NULL,
ALTER COLUMN "emailHistory" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "ProposalService" DROP COLUMN "frequency",
ADD COLUMN     "frequency" "PricingFrequency" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "ProposalSignature" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "signedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "agreementAccepted" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProposalView" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "viewedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "completed" SET NOT NULL;

-- AlterTable
ALTER TABLE "ServiceTemplate" DROP COLUMN "category",
ADD COLUMN     "category" "ServiceCategory" NOT NULL,
DROP COLUMN "pricingModel",
ADD COLUMN     "pricingModel" "PricingModel" NOT NULL DEFAULT 'FIXED',
DROP COLUMN "defaultFrequency",
ADD COLUMN     "defaultFrequency" "PricingFrequency" NOT NULL DEFAULT 'MONTHLY',
ALTER COLUMN "billingCycle" SET NOT NULL,
ALTER COLUMN "vatRate" SET NOT NULL,
ALTER COLUMN "isVatApplicable" SET NOT NULL,
ALTER COLUMN "fixedBillingDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "annualEquivalent" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "vatRegistered" SET NOT NULL,
ALTER COLUMN "defaultVatRate" SET NOT NULL,
ALTER COLUMN "autoApplyVat" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'JUNIOR';

-- CreateIndex
CREATE INDEX "Client_companyType_idx" ON "Client"("companyType");

-- CreateIndex
CREATE INDEX "Client_mtditsaStatus_idx" ON "Client"("mtditsaStatus");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "ProposalSignature_signedAt_idx" ON "ProposalSignature"("signedAt");

-- CreateIndex
CREATE INDEX "ProposalView_viewedAt_idx" ON "ProposalView"("viewedAt");

-- CreateIndex
CREATE INDEX "ServiceTemplate_category_idx" ON "ServiceTemplate"("category");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "ProposalView" ADD CONSTRAINT "ProposalView_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSignature" ADD CONSTRAINT "ProposalSignature_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_proposal_share_token" RENAME TO "Proposal_shareToken_idx";

-- RenameIndex
ALTER INDEX "idx_proposal_signature_proposalId" RENAME TO "ProposalSignature_proposalId_idx";

-- RenameIndex
ALTER INDEX "idx_proposal_view_proposalId" RENAME TO "ProposalView_proposalId_idx";
