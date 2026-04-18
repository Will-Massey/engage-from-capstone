-- Add priceDisplayMode column to ProposalService
ALTER TABLE "ProposalService" ADD COLUMN IF NOT EXISTS "priceDisplayMode" "PriceDisplayMode" DEFAULT 'PER_MONTH';
