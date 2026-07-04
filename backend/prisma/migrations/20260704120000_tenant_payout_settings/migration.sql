-- Tenant payout opt-in + payment split fee breakdown + client payment consent

CREATE TABLE "tenant_payout_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" TIMESTAMP(3),
    "enabled_by_user_id" TEXT,
    "consent_version" TEXT,
    "consent_accepted_at" TIMESTAMP(3),
    "consent_ip" TEXT,
    "allow_revolut_pay" BOOLEAN NOT NULL DEFAULT true,
    "allow_card" BOOLEAN NOT NULL DEFAULT true,
    "payout_method" TEXT NOT NULL DEFAULT 'UK_BANK_TRANSFER',
    "account_holder_name" TEXT,
    "bank_details_encrypted" TEXT,
    "bank_details_last4" TEXT,
    "revolut_counterparty_id" TEXT,
    "platform_fee_bps_override" INTEGER,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "first_payout_held_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_payout_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_payout_settings_tenant_id_key" ON "tenant_payout_settings"("tenant_id");

ALTER TABLE "tenant_payout_settings" ADD CONSTRAINT "tenant_payout_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_splits" ADD COLUMN IF NOT EXISTS "processor_fee_pence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_splits" ADD COLUMN IF NOT EXISTS "processor_markup_pence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_splits" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "payment_splits" ADD COLUMN IF NOT EXISTS "payout_failure_reason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_splits_idempotency_key_key" ON "payment_splits"("idempotency_key");

ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "payment_auth_accepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "payment_auth_accepted_at" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "payment_auth_version" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "engagement_letter_accepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "engagement_letter_accepted_at" TIMESTAMP(3);