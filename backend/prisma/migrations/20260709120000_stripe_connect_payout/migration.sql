-- Stripe Connect destination charges: recipient account + capability status.
-- Drop Revolut/bank collection fields (Stripe-hosted onboarding owns bank + identity).

ALTER TABLE "tenant_payout_settings" ADD COLUMN "stripe_connected_account_id" TEXT;
ALTER TABLE "tenant_payout_settings" ADD COLUMN "stripe_transfers_status" TEXT NOT NULL DEFAULT 'inactive';

ALTER TABLE "tenant_payout_settings" ALTER COLUMN "payout_method" SET DEFAULT 'STRIPE_CONNECT';

ALTER TABLE "tenant_payout_settings" DROP COLUMN IF EXISTS "allow_revolut_pay";
ALTER TABLE "tenant_payout_settings" DROP COLUMN IF EXISTS "allow_card";
ALTER TABLE "tenant_payout_settings" DROP COLUMN IF EXISTS "bank_details_encrypted";
ALTER TABLE "tenant_payout_settings" DROP COLUMN IF EXISTS "bank_details_last4";
ALTER TABLE "tenant_payout_settings" DROP COLUMN IF EXISTS "revolut_counterparty_id";
