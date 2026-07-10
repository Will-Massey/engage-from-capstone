-- Recurring fee collection (R1): persist the Stripe subscription created by a
-- subscription-mode checkout so billing-portal and MRR lookups can find it.
ALTER TABLE "Proposal" ADD COLUMN "stripeSubscriptionId" TEXT;
