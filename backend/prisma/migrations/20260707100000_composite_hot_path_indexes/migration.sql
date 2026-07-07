-- Composite indexes for hot tenant-scoped query paths
-- (2026-07-07 perf/ops audit — analytics funnel, proposals list,
-- chase/renewal/touchpoint jobs). Additive only.

-- CreateIndex
CREATE INDEX "Proposal_tenantId_status_idx" ON "Proposal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_createdAt_idx" ON "Proposal"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_sentAt_idx" ON "Proposal"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_status_renewalDate_idx" ON "Proposal"("tenantId", "status", "renewalDate");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_validUntil_idx" ON "Proposal"("tenantId", "validUntil");

-- CreateIndex
CREATE INDEX "Touchpoint_status_scheduledFor_idx" ON "Touchpoint"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_createdAt_idx" ON "ActivityLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_entityType_entityId_idx" ON "ActivityLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EmailLog_tenantId_createdAt_idx" ON "EmailLog"("tenantId", "createdAt");
