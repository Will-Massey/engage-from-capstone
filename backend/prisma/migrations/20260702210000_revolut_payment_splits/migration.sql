-- Revolut payment integration: tenant fields + payment split ledger

ALTER TABLE "Tenant" ADD COLUMN "revolut_customer_id" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "revolut_order_id" TEXT;

CREATE TABLE "payment_splits" (
    "id" TEXT NOT NULL,
    "revolut_order_id" TEXT NOT NULL,
    "total_pence" INTEGER NOT NULL,
    "platform_fee_pence" INTEGER NOT NULL,
    "agency_share_pence" INTEGER NOT NULL,
    "platform_fee_bps" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "payout_status" TEXT NOT NULL DEFAULT 'PENDING',
    "payout_transfer_id" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,

    CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_splits_revolut_order_id_key" ON "payment_splits"("revolut_order_id");
CREATE INDEX "payment_splits_proposal_id_idx" ON "payment_splits"("proposal_id");
CREATE INDEX "payment_splits_tenant_id_idx" ON "payment_splits"("tenant_id");

ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;