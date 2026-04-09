-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentFailureReason" TEXT,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "paymentUrl" TEXT;

-- CreateIndex
CREATE INDEX "Proposal_paymentId_idx" ON "Proposal"("paymentId");
