-- Additive: optional "where did you hear about us?" plus first-touch URL params.
-- All nullable. Existing practices stay null (we do not invent an answer).
-- Applied on deploy by `prisma migrate deploy` in backend/start-prod.mjs.
-- Does not drop or rewrite existing columns.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "heardAbout" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "heardAboutOther" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "signupReferrer" TEXT;
