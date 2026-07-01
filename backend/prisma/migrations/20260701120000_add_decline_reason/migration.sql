-- CreateEnum
CREATE TYPE "DeclineReason" AS ENUM ('PRICE', 'SCOPE', 'TIMING', 'COMPETITOR', 'OTHER');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "declinedBy" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "declineReason" "DeclineReason";
ALTER TABLE "Proposal" ADD COLUMN "declineReasonText" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "declineReasonAi" "DeclineReason";

-- CreateIndex
CREATE INDEX "Proposal_declineReason_idx" ON "Proposal"("declineReason");