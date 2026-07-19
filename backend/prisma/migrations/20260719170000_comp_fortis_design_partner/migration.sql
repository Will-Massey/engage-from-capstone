-- Give the Fortis design-partner tenant a 5-year complimentary subscription
-- (William, 2026-07-19). Its 7-day trial expired on the public funnel it was
-- never meant to go through, blocking proposal sends (402 TRIAL_EXPIRED).
-- 'complimentary' passes the billing gates (subscriptionService / tierLimits)
-- as of this release; trialEndsAt +5 years is the backstop so sends still
-- pass until 2031 even if the status is ever reverted to 'trialing'.
-- No-op on databases without the Fortis account.
UPDATE "Tenant"
SET "subscriptionStatus" = 'complimentary',
    "subscriptionTier"   = 'PROFESSIONAL',
    "trialEndsAt"        = NOW() + INTERVAL '5 years'
WHERE id IN (
  SELECT "tenantId" FROM "User" WHERE email = 'caroline@fortisaccounts.com'
);
