-- Client AML self-service submission (portal form)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "amlSubmissionData" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "amlSubmittedAt" TIMESTAMP(3);
