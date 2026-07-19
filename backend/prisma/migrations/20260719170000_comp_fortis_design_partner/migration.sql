-- Comp the Fortis design-partner tenant: its 7-day trial expired on the
-- public funnel it was never meant to go through, blocking proposal sends
-- (402 TRIAL_EXPIRED, 2026-07-19). 'complimentary' passes the billing gates
-- (subscriptionService / tierLimits) as of this release. No-op on databases
-- without the Fortis account.
UPDATE "Tenant"
SET "subscriptionStatus" = 'complimentary',
    "subscriptionTier"   = 'PROFESSIONAL'
WHERE id IN (
  SELECT "tenantId" FROM "User" WHERE email = 'caroline@fortisaccounts.com'
);
