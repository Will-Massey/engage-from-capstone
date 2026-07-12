-- Regulatory signals (R5.2): persisted output of the deterministic regulatory
-- rule engine — one row per (tenant, client, rule), raised/resolved nightly.

-- CreateTable
CREATE TABLE "RegulatorySignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "firstRaisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "dismissedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RegulatorySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegulatorySignal_tenantId_status_idx" ON "RegulatorySignal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RegulatorySignal_clientId_idx" ON "RegulatorySignal"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatorySignal_tenantId_clientId_ruleId_key" ON "RegulatorySignal"("tenantId", "clientId", "ruleId");

-- AddForeignKey
ALTER TABLE "RegulatorySignal" ADD CONSTRAINT "RegulatorySignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySignal" ADD CONSTRAINT "RegulatorySignal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySignal" ADD CONSTRAINT "RegulatorySignal_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
