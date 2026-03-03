-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0ea5e9',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0284c7',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'JUNIOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "emailVerified" TIMESTAMP(3),
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyType" TEXT NOT NULL DEFAULT 'SOLE_TRADER',
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactName" TEXT,
    "companyNumber" TEXT,
    "utr" TEXT,
    "vatNumber" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "mtditsaStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "mtditsaIncome" DOUBLE PRECISION,
    "mtditsaEligible" BOOLEAN NOT NULL DEFAULT false,
    "industry" TEXT,
    "employeeCount" INTEGER,
    "turnover" DOUBLE PRECISION,
    "yearEnd" TEXT,
    "notes" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountType" TEXT,
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentTerms" TEXT NOT NULL DEFAULT '30 days',
    "paymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "coverLetter" TEXT,
    "terms" TEXT,
    "notes" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "acceptedBy" TEXT,
    "acceptedByIp" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "proposalId" TEXT NOT NULL,
    "serviceTemplateId" TEXT,

    CONSTRAINT "ProposalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalDocument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proposalId" TEXT NOT NULL,

    CONSTRAINT "ProposalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "longDescription" TEXT,
    "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "pricingModel" TEXT NOT NULL DEFAULT 'FIXED',
    "frequencyOptions" TEXT NOT NULL DEFAULT 'MONTHLY,QUARTERLY,ANNUALLY',
    "defaultFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "complexityFactors" TEXT NOT NULL DEFAULT '[]',
    "requirements" TEXT NOT NULL DEFAULT '[]',
    "deliverables" TEXT NOT NULL DEFAULT '[]',
    "applicableEntityTypes" TEXT NOT NULL DEFAULT 'LIMITED_COMPANY,SOLE_TRADER',
    "regulatoryNotes" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetEntityType" TEXT,
    "targetIndustry" TEXT,
    "title" TEXT NOT NULL,
    "coverLetter" TEXT,
    "terms" TEXT,
    "serviceConfig" TEXT NOT NULL DEFAULT '[]',
    "defaultPricing" TEXT NOT NULL DEFAULT '{}',
    "usageCount" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ProposalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "conditionField" TEXT NOT NULL,
    "conditionOperator" TEXT NOT NULL,
    "conditionValue" TEXT NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "adjustmentValue" DOUBLE PRECISION NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "proposalId" TEXT,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");

-- CreateIndex
CREATE INDEX "Tenant_subdomain_idx" ON "Tenant"("subdomain");

-- CreateIndex
CREATE INDEX "Tenant_isActive_idx" ON "Tenant"("isActive");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_tenantId_key" ON "User"("email", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE INDEX "Client_companyType_idx" ON "Client"("companyType");

-- CreateIndex
CREATE INDEX "Client_mtditsaStatus_idx" ON "Client"("mtditsaStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_contactEmail_key" ON "Client"("tenantId", "contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_reference_key" ON "Proposal"("reference");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_idx" ON "Proposal"("tenantId");

-- CreateIndex
CREATE INDEX "Proposal_clientId_idx" ON "Proposal"("clientId");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "Proposal_reference_idx" ON "Proposal"("reference");

-- CreateIndex
CREATE INDEX "Proposal_createdAt_idx" ON "Proposal"("createdAt");

-- CreateIndex
CREATE INDEX "ProposalService_proposalId_idx" ON "ProposalService"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalDocument_proposalId_idx" ON "ProposalDocument"("proposalId");

-- CreateIndex
CREATE INDEX "ServiceTemplate_tenantId_idx" ON "ServiceTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceTemplate_category_idx" ON "ServiceTemplate"("category");

-- CreateIndex
CREATE INDEX "ServiceTemplate_isActive_idx" ON "ServiceTemplate"("isActive");

-- CreateIndex
CREATE INDEX "ProposalTemplate_tenantId_idx" ON "ProposalTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "ProposalTemplate_isDefault_idx" ON "ProposalTemplate"("isDefault");

-- CreateIndex
CREATE INDEX "ProposalTemplate_targetEntityType_idx" ON "ProposalTemplate"("targetEntityType");

-- CreateIndex
CREATE INDEX "PricingRule_tenantId_idx" ON "PricingRule"("tenantId");

-- CreateIndex
CREATE INDEX "PricingRule_serviceId_idx" ON "PricingRule"("serviceId");

-- CreateIndex
CREATE INDEX "PricingRule_isActive_idx" ON "PricingRule"("isActive");

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_idx" ON "ActivityLog"("tenantId");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_proposalId_idx" ON "ActivityLog"("proposalId");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalService" ADD CONSTRAINT "ProposalService_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalService" ADD CONSTRAINT "ProposalService_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDocument" ADD CONSTRAINT "ProposalDocument_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTemplate" ADD CONSTRAINT "ServiceTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalTemplate" ADD CONSTRAINT "ProposalTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
