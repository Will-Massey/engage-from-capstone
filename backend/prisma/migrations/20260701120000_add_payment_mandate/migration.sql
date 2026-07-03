-- AlterTable: post-sign payment mandate tracking (W1.3–W1.4)
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "paymentMandateId" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Proposal_paymentMandateId_idx" ON "Proposal"("paymentMandateId");