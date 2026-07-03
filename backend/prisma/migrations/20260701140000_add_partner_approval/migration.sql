-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Proposal" ADD COLUMN "submittedForApprovalAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "approvalNotes" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "rejectionReason" TEXT;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Proposal_approvalStatus_idx" ON "Proposal"("approvalStatus");
CREATE INDEX "Proposal_approvedById_idx" ON "Proposal"("approvedById");