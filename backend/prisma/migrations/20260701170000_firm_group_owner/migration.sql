-- W4.3 — Firm group owner practice for multi-firm workspace admin
ALTER TABLE "FirmGroup" ADD COLUMN "ownerTenantId" TEXT;

CREATE INDEX "FirmGroup_ownerTenantId_idx" ON "FirmGroup"("ownerTenantId");

ALTER TABLE "FirmGroup" ADD CONSTRAINT "FirmGroup_ownerTenantId_fkey"
  FOREIGN KEY ("ownerTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;