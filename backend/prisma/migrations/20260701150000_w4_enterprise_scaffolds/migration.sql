-- W4.3 Multi-firm workspace stub
CREATE TABLE "FirmGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FirmGroup_slug_key" ON "FirmGroup"("slug");
CREATE INDEX "FirmGroup_slug_idx" ON "FirmGroup"("slug");

ALTER TABLE "Tenant" ADD COLUMN "firmGroupId" TEXT;

CREATE INDEX "Tenant_firmGroupId_idx" ON "Tenant"("firmGroupId");

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_firmGroupId_fkey" FOREIGN KEY ("firmGroupId") REFERENCES "FirmGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;