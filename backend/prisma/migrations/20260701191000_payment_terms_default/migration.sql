-- Default payment terms: 7 days (configurable per tenant in settings)
ALTER TABLE "Proposal" ALTER COLUMN "paymentTerms" SET DEFAULT '7 days';