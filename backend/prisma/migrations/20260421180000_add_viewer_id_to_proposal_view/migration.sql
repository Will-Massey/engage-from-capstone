-- Add viewerId column to ProposalView for authenticated in-app tracking
ALTER TABLE "ProposalView" ADD COLUMN IF NOT EXISTS "viewerId" TEXT;

-- Create index for viewerId lookups
CREATE INDEX IF NOT EXISTS "ProposalView_viewerId_idx" ON "ProposalView"("viewerId");
