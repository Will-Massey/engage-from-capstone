-- W4.3 — Firm group owner practice for multi-firm workspace admin
ALTER TABLE "FirmGroup" ADD COLUMN "ownerTenantId" TEXT;

CREATE INDEX "FirmGroup_ownerTenantId_idx" ON "FirmGroup"("ownerTenantId");

ALTER TABLE "FirmGroup" ADD CONSTRAINT "FirmGroup_ownerTenantId_fkey"
  FOREIGN KEY ("ownerTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill owner from earliest member practice
UPDATE "FirmGroup" fg
SET "ownerTenantId" = sub.tid
FROM (
  SELECT t."firmGroupId" AS gid, t.id AS tid
  FROM "Tenant" t
  WHERE t."firmGroupId" IS NOT NULL
  ORDER BY t."createdAt" ASC
) sub
WHERE fg.id = sub.gid AND fg."ownerTenantId" IS NULL;