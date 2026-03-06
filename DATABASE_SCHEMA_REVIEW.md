# Database Schema Review - Engage by Capstone

**Review Date:** 2026-03-04  
**Schema File:** `engage/backend/prisma/schema.prisma`  
**Database:** PostgreSQL  
**Prisma Version:** Latest (with Client JS)

---

## Executive Summary

The Engage by Capstone database schema implements a multi-tenant SaaS architecture with 15 main models supporting proposal management, client tracking, service templating, and UK tax compliance (MTD ITSA). The schema demonstrates good normalization practices with proper relation definitions and cascade behaviors.

**Overall Rating:** ⭐⭐⭐⭐ (4/5) - Good foundation with some optimization opportunities

---

## 1. Model Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    TENANT                                       │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┐│
│  │    User     │   Client    │  Proposal   │   Service   │   ProposalTemplate  ││
│  │             │             │             │  Template   │                     ││
│  └──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────────┬──────────┘│
│         │             │             │             │                 │          │
│         │    ┌────────┴────────┐    │      ┌──────┴──────┐          │          │
│         │    │                 │    │      │             │          │          │
│         └───►│  RefreshToken   │    │      │ PricingRule │◄─────────┘          │
│              │                 │    │      │             │                     │
│              └─────────────────┘    │      └─────────────┘                     │
│                                     │                                           │
│                              ┌──────┴──────┐                                    │
│                              │             │                                    │
│                              │  Proposal   │                                    │
│                              │             │                                    │
│         ┌────────────────────┼─────────────┼────────────────────┐              │
│         │                    │             │                    │              │
│         ▼                    ▼             ▼                    ▼              │
│  ┌─────────────┐    ┌────────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │   Proposal  │    │ ProposalService│  │ProposalView  │  │ProposalSignature│  │
│  │  Document   │    │                │  │  (Audit)     │  │   (Audit)     │   │
│  └─────────────┘    └────────┬───────┘  └──────────────┘  └───────────────┘   │
│                              │                                                │
│                              │                                                │
│                              ▼                                                │
│                       ┌──────────────┐                                        │
│                       │ServiceTemplate│                                       │
│                       └──────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 AUDIT LAYER                                     │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                           ActivityLog                                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐│  │
│  │  │   tenant    │  │    user     │  │   proposal  │  │  entityType+Id     ││  │
│  │  │   (req)     │  │  (opt/set   │  │   (opt/set  │  │   (generic ref)    ││  │
│  │  │             │  │   null)     │  │    null)    │  │                    ││  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Relationship Patterns

| Pattern | Description | Risk Level |
|---------|-------------|------------|
| Tenant Isolation | All tenant-scoped tables have `tenantId` foreign key | ✅ Low |
| Cascade Delete | Tenant deletion cascades to all child records | ⚠️ Medium |
| Audit Preservation | ActivityLog uses `SetNull` for user/proposal deletion | ✅ Low |
| Proposal Integrity | `createdBy` uses `Restrict` to prevent orphan proposals | ✅ Low |

---

## 2. Enums Analysis

### 2.1 BillingCycle
```prisma
enum BillingCycle {
  FIXED_DATE
  WEEKLY
  MONTHLY
  QUARTERLY
  ANNUALLY
}
```
**Status:** ✅ Complete  
**Usage:** ServiceTemplate billing configuration  
**Note:** `FIXED_DATE` allows specific calendar date billing (e.g., "15th of every month")

### 2.2 VATRate (UK Specific)
```prisma
enum VATRate {
  ZERO
  REDUCED_5
  STANDARD_20
  EXEMPT
}
```
**Status:** ✅ Complete for UK market  
**Usage:** ServiceTemplate.vatRate, Tenant.defaultVatRate  
**Compliance:** Covers all current UK VAT categories

### 2.3 UserRole
```prisma
enum UserRole {
  ADMIN
  PARTNER
  MANAGER
  SENIOR
  JUNIOR
}
```
**Status:** ⚠️ Needs Review  
**Concerns:**
- No explicit hierarchy defined in schema
- No role-based permissions table (permissions likely hardcoded)
- Missing SUPER_ADMIN for platform-level management

### 2.4 CompanyType
```prisma
enum CompanyType {
  SOLE_TRADER
  PARTNERSHIP
  LIMITED_COMPANY
  LLP
  CHARITY
  NON_PROFIT
}
```
**Status:** ✅ Complete  
**Usage:** Client entity classification  
**Note:** Good coverage for UK accounting practice

### 2.5 MTDITSAStatus
```prisma
enum MTDITSAStatus {
  NOT_REQUIRED
  ELIGIBLE
  MANDATORY
  OPTED_IN
  EXEMPT
  REQUIRED_2026
  REQUIRED_2027
  REQUIRED_2028
}
```
**Status:** ✅ Well-designed for future requirements  
**Usage:** Making Tax Digital for Income Tax Self Assessment tracking  
**Compliance:** Supports HMRC phased rollout timeline

### 2.6 ProposalStatus
```prisma
enum ProposalStatus {
  DRAFT
  SENT
  VIEWED
  ACCEPTED
  DECLINED
  EXPIRED
}
```
**Status:** ⚠️ Minor Gap  
**Missing:** No `ARCHIVED` or `CANCELLED` status for abandoned proposals

### 2.7 PricingFrequency
```prisma
enum PricingFrequency {
  ONE_TIME
  WEEKLY
  MONTHLY
  QUARTERLY
  ANNUALLY
}
```
**Status:** ✅ Complete

### 2.8 ServiceCategory
```prisma
enum ServiceCategory {
  COMPLIANCE
  ADVISORY
  TAX
  PAYROLL
  BOOKKEEPING
  AUDIT
  CONSULTING
}
```
**Status:** ✅ Complete for accounting practice

### 2.9 PricingModel
```prisma
enum PricingModel {
  FIXED
  HOURLY
  TIERED
  CUSTOM
}
```
**Status:** ✅ Complete

---

## 3. Model-by-Model Analysis

### 3.1 Tenant
```prisma
model Tenant {
  id             String   @id @default(uuid())
  subdomain      String   @unique
  name           String
  logo           String?
  primaryColor   String   @default("#0ea5e9")
  secondaryColor String   @default("#0284c7")
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  settings       String   @default("{}")
  
  // VAT Settings
  vatRegistered Boolean @default(true)
  vatNumber     String?
  defaultVatRate VATRate @default(STANDARD_20)
  autoApplyVat   Boolean @default(true)
  
  // Relations...
}
```

**Strengths:**
- ✅ Unique subdomain for multi-tenant routing
- ✅ JSON settings field for extensibility
- ✅ VAT configuration at tenant level
- ✅ Tenant-level branding (colors, logo)

**Concerns:**
- ⚠️ No `billingEmail` field for invoicing
- ⚠️ No `subscriptionPlan` or `subscriptionExpiry` fields
- ⚠️ No `maxUsers` limit field
- ⚠️ `settings` JSON field lacks validation schema
- ⚠️ No `deletedAt` soft delete support

**Missing Indexes:**
```prisma
@@index([createdAt])  // For tenant creation reporting
@@index([isActive, createdAt])  // For active tenant listings
```

---

### 3.2 User
```prisma
model User {
  id            String    @id @default(uuid())
  email         String
  passwordHash  String
  firstName     String
  lastName      String
  role          UserRole  @default(JUNIOR)
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  emailVerified DateTime?
  avatar        String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Relations...
  
  @@unique([email, tenantId])
  @@index([tenantId])
  @@index([role])
}
```

**Strengths:**
- ✅ Composite unique constraint on email+tenant (allows same email across tenants)
- ✅ Cascade delete when tenant removed
- ✅ Role-based access with enum

**Concerns:**
- ⚠️ **CRITICAL:** No `failedLoginAttempts` or `lockedUntil` for brute force protection
- ⚠️ No `passwordChangedAt` for password rotation policies
- ⚠️ No `twoFactorEnabled` or `twoFactorSecret` fields
- ⚠️ No `invitedBy` or `inviteToken` for invitation workflow
- ⚠️ No `deletedAt` soft delete support
- ⚠️ Avatar field doesn't specify if it's URL or base64

**Missing Indexes:**
```prisma
@@index([email])  // For faster email lookups within tenant
@@index([isActive, tenantId])  // For active user listings
@@index([lastLoginAt])  // For identifying inactive users
```

**Data Integrity Risk:**
- **HIGH:** Password hash storage needs bcrypt/scrypt with proper salt rounds (application-level concern)

---

### 3.3 RefreshToken
```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([token])
  @@index([userId])
}
```

**Strengths:**
- ✅ Proper expiration tracking
- ✅ Unique token constraint
- ✅ Cascade delete on user removal

**Concerns:**
- ⚠️ No `revokedAt` field for token invalidation
- ⚠️ No `deviceInfo` or `ipAddress` for security tracking
- ⚠️ No `replacedByTokenId` for token rotation tracking
- ⚠️ No cleanup mechanism for expired tokens (application-level)

**Missing Indexes:**
```prisma
@@index([expiresAt])  // For cleaning up expired tokens
@@index([userId, expiresAt])  // For user's active sessions query
```

---

### 3.4 Client
```prisma
model Client {
  id              String       @id @default(uuid())
  name            String
  companyType     CompanyType  @default(SOLE_TRADER)
  contactEmail    String
  contactPhone    String?
  contactName     String?
  
  companyNumber String?
  utr           String?
  vatNumber     String?
  vatRegistered Boolean @default(false)
  
  address String?  // JSON string
  
  // MTD ITSA
  mtditsaStatus   MTDITSAStatus @default(NOT_REQUIRED)
  mtditsaIncome   Float?
  mtditsaEligible Boolean @default(false)
  
  industry      String?
  employeeCount Int?
  turnover      Float?
  yearEnd       String?
  
  notes    String?
  tags     String @default("")  // Comma-separated
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Relations...
  
  @@unique([tenantId, contactEmail])
  @@index([tenantId])
  @@index([companyType])
  @@index([mtditsaStatus])
}
```

**Strengths:**
- ✅ MTD ITSA compliance fields
- ✅ UK-specific fields (UTR, Company Number)
- ✅ Flexible address JSON storage
- ✅ Composite unique on tenant+email

**Concerns:**
- ⚠️ **CRITICAL:** `tags` stored as comma-separated string instead of normalized table or array
- ⚠️ `address` as JSON string lacks structure validation
- ⚠️ No `billingAddress` separate from `registeredAddress`
- ⚠️ No `paymentTerms` or `paymentMethod` fields
- ⚠️ No `creditLimit` for client risk management
- ⚠️ No `accountManagerId` for assignment
- ⚠️ No `referralSource` for marketing tracking
- ⚠️ No `deletedAt` soft delete support
- ⚠️ `yearEnd` as String instead of Date (e.g., "31-03" vs full date)

**Missing Indexes:**
```prisma
@@index([name])  // For client search
@@index([isActive, tenantId])  // For active client listings
@@index([createdAt])  // For reporting
@@index([tenantId, isActive, createdAt])  // Combined listing query
```

**Data Integrity Risk:**
- **MEDIUM:** `tags` comma-separated approach complicates querying and risks data inconsistency
- **MEDIUM:** `address` JSON field structure not enforced

---

### 3.5 Proposal
```prisma
model Proposal {
  id              String         @id @default(uuid())
  reference       String         @unique
  title           String
  status          ProposalStatus @default(DRAFT)
  
  validUntil   DateTime
  sentAt       DateTime?
  viewedAt     DateTime?
  acceptedAt   DateTime?
  declinedAt   DateTime?
  expiredAt    DateTime?
  
  // Pricing
  subtotal       Float   @default(0)
  discountType   String?
  discountValue  Float   @default(0)
  discountAmount Float   @default(0)
  vatRate        Float   @default(20)
  vatAmount      Float   @default(0)
  total          Float   @default(0)
  
  paymentTerms     String           @default("30 days")
  paymentFrequency PricingFrequency @default(MONTHLY)
  
  coverLetter  String?
  terms        String?
  notes        String?
  customFields String @default("{}")  // JSON
  
  // UK Compliant Engagement Letter
  engagementLetter String?
  termsAccepted    Boolean   @default(false)
  termsAcceptedAt  DateTime?
  
  // Acceptance
  acceptedBy   String?
  acceptedByIp String?
  signature    String?
  
  // Sharing & Public Access
  shareToken        String?   @unique
  shareTokenExpiry  DateTime?
  publicAccessEnabled Boolean @default(false)
  
  // Email Tracking
  lastEmailedAt  DateTime?
  emailHistory   String @default("[]")  // JSON array
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  
  createdById String
  createdBy   User   @relation("CreatedProposals", fields: [createdById], references: [id])
  
  // Relations...
  
  @@index([tenantId])
  @@index([clientId])
  @@index([status])
  @@index([reference])
  @@index([shareToken])
  @@index([createdAt])
}
```

**Strengths:**
- ✅ Comprehensive pricing fields with VAT support
- ✅ Full proposal lifecycle tracking (dates)
- ✅ Secure sharing with token-based access
- ✅ Email tracking history
- ✅ UK compliance fields (engagement letter, e-signature)

**Concerns:**
- ⚠️ **CRITICAL:** No version control for proposal revisions
- ⚠️ **CRITICAL:** `createdBy` relation uses default `Restrict` (not cascade) - user deletion blocked if proposals exist
- ⚠️ No `convertedToJobId` or `convertedToInvoiceId` for workflow tracking
- ⚠️ No `currency` field (assumes GBP but not explicit)
- ⚠️ `customFields` JSON lacks schema validation
- ⚠️ No `reminderSentAt` or `reminderCount` for follow-up tracking
- ⚠️ No `declineReason` field
- ⚠️ No `expiryNotificationSent` tracking
- ⚠️ `discountType` as String instead of enum (e.g., PERCENTAGE, FIXED_AMOUNT)

**Missing Indexes:**
```prisma
@@index([tenantId, status])  // For dashboard status filtering
@@index([clientId, status])  // For client proposal history
@@index([validUntil])  // For expiry processing
@@index([status, validUntil])  // For finding expired proposals
@@index([shareTokenExpiry])  // For cleanup of expired tokens
@@index([tenantId, createdAt DESC])  // For recent proposals listing
```

**Data Integrity Risk:**
- **HIGH:** Pricing fields (subtotal, vatAmount, total) can become inconsistent if not calculated atomically
- **MEDIUM:** `emailHistory` JSON array structure not enforced

---

### 3.6 ProposalService
```prisma
model ProposalService {
  id          String @id @default(uuid())
  name        String
  description String?
  
  quantity        Float @default(1)
  unitPrice       Float
  discountPercent Float @default(0)
  total           Float
  
  frequency  PricingFrequency @default(MONTHLY)
  isOptional Boolean @default(false)
  
  sortOrder Int @default(0)
  
  proposalId String
  proposal   Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  serviceTemplateId String?
  serviceTemplate   ServiceTemplate? @relation(fields: [serviceTemplateId], references: [id])
  
  @@index([proposalId])
}
```

**Strengths:**
- ✅ Denormalized `name` field (preserves history if template changes)
- ✅ Sort order for display sequencing
- ✅ Optional service flag

**Concerns:**
- ⚠️ **CRITICAL:** `total` field is stored but should be calculated (quantity * unitPrice * (1 - discountPercent/100))
- ⚠️ No `hoursEstimated` or `hoursActual` for time tracking
- ⚠️ No `startDate` or `endDate` for service period
- ⚠️ No `billingStartDate` separate from proposal dates
- ⚠️ `serviceTemplate` relation has no cascade behavior specified (defaults to Restrict)

**Missing Indexes:**
```prisma
@@index([proposalId, sortOrder])  // For ordered retrieval
@@index([serviceTemplateId])  // For service usage analytics
@@index([proposalId, isOptional])  // For required vs optional filtering
```

**Data Integrity Risk:**
- **HIGH:** `total` field could become out of sync with calculated value
- **MEDIUM:** No validation that discountPercent is between 0-100

---

### 3.7 ProposalDocument
```prisma
model ProposalDocument {
  id         String   @id @default(uuid())
  name       String
  fileUrl    String
  fileType   String
  fileSize   Int
  uploadedAt DateTime @default(now())
  
  proposalId String
  proposal   Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  @@index([proposalId])
}
```

**Strengths:**
- ✅ File metadata stored (type, size)
- ✅ Cascade delete on proposal removal

**Concerns:**
- ⚠️ No `uploadedById` for audit trail
- ⚠️ No `isPublic` or `clientVisible` flag
- ⚠️ `fileUrl` could be external URL or internal path - ambiguous
- ⚠️ No `storageProvider` field (S3, Azure, local)
- ⚠️ No `checksum` or `hash` for file integrity
- ⚠️ No `deletedAt` soft delete support

**Missing Indexes:**
```prisma
@@index([proposalId, uploadedAt])  // For chronological listing
```

---

### 3.8 ProposalView
```prisma
model ProposalView {
  id        String   @id @default(uuid())
  viewedAt  DateTime @default(now())
  ipAddress String?
  userAgent String?
  viewDuration Int?  // Duration in seconds
  completed Boolean  @default(false)
  
  proposalId String
  proposal   Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  @@index([proposalId])
  @@index([viewedAt])
}
```

**Strengths:**
- ✅ Analytics tracking for proposal engagement
- ✅ Duration tracking for engagement depth
- ✅ `completed` flag for full read tracking

**Concerns:**
- ⚠️ No `viewerEmail` or `viewerId` for known viewers
- ⚠️ IP address storage has GDPR implications
- ⚠️ No `referrer` tracking
- ⚠️ No `deviceType` (mobile/desktop) categorization

**Missing Indexes:**
```prisma
@@index([proposalId, viewedAt DESC])  // For recent views query
```

---

### 3.9 ProposalSignature
```prisma
model ProposalSignature {
  id        String   @id @default(uuid())
  signedBy  String
  signedByRole String
  signatureData String // Base64 encoded signature image
  signedAt  DateTime @default(now())
  ipAddress String?
  agreementVersion String
  agreementAccepted Boolean
  
  proposalId String
  proposal   Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  @@index([proposalId])
  @@index([signedAt])
}
```

**Strengths:**
- ✅ UK eIDAS compliant signature storage
- ✅ Agreement versioning for legal traceability
- ✅ IP address for non-repudiation

**Concerns:**
- ⚠️ **CRITICAL:** `signatureData` as base64 string could be very large (consider separate storage)
- ⚠️ No `signerEmail` verification field
- ⚠️ No `witnessId` for two-party signatures
- ⚠️ No `revokedAt` or revocation tracking
- ⚠️ GDPR concern with IP address storage

**Missing Indexes:**
```prisma
@@index([proposalId, signedAt DESC])  // For signature history
```

---

### 3.10 ServiceTemplate
```prisma
model ServiceTemplate {
  id              String @id @default(uuid())
  category        ServiceCategory
  subcategory     String?
  name            String
  description     String
  longDescription String?
  
  basePrice    Float @default(0)
  baseHours    Float @default(1)
  pricingModel PricingModel @default(FIXED)
  
  billingCycle      BillingCycle @default(MONTHLY)
  vatRate           VATRate      @default(STANDARD_20)
  isVatApplicable   Boolean      @default(true)
  fixedBillingDate  DateTime?
  billingDayOfMonth Int?         // 1-31 for monthly billing
  annualEquivalent  Float?       // Annual cost for monthly calculation
  
  frequencyOptions String @default("MONTHLY,QUARTERLY,ANNUALLY")
  defaultFrequency PricingFrequency @default(MONTHLY)
  
  complexityFactors String @default("[]")  // JSON
  
  requirements String @default("[]")  // JSON
  deliverables String @default("[]")  // JSON
  
  applicableEntityTypes String @default("LIMITED_COMPANY,SOLE_TRADER")
  regulatoryNotes       String?
  
  tags      String  @default("")  // Comma-separated
  isActive  Boolean @default(true)
  isPopular Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Relations...
  
  @@index([tenantId])
  @@index([category])
  @@index([isActive])
}
```

**Strengths:**
- ✅ Comprehensive service definition
- ✅ Flexibility with pricing models
- ✅ UK VAT handling
- ✅ Complexity factors for dynamic pricing

**Concerns:**
- ⚠️ **CRITICAL:** `frequencyOptions` stored as comma-separated string (same tags issue)
- ⚠️ **CRITICAL:** `applicableEntityTypes` stored as comma-separated string
- ⚠️ Multiple JSON fields without validation schemas
- ⚠️ No `parentServiceId` for hierarchical services
- ⚠️ No `serviceCode` or SKU for accounting integration
- ⚠️ No `costRate` for profitability tracking
- ⚠️ No `departmentId` or `practiceArea` classification
- ⚠️ `billingDayOfMonth` lacks validation constraint (1-31)

**Missing Indexes:**
```prisma
@@index([tenantId, isActive])  // For active service listing
@@index([tenantId, category, isActive])  // For category filtering
@@index([tenantId, isPopular])  // For featured services
@@index([name])  // For service search
```

---

### 3.11 ProposalTemplate
```prisma
model ProposalTemplate {
  id          String   @id @default(uuid())
  name        String
  description String?
  
  targetEntityType String?
  targetIndustry   String?
  
  title String
  coverLetter String?
  terms       String?
  
  serviceConfig String @default("[]")  // JSON
  defaultPricing String @default("{}")  // JSON
  
  usageCount Int?
  lastUsedAt DateTime?
  
  isActive  Boolean  @default(true)
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdById String?
  
  @@index([tenantId])
  @@index([isDefault])
  @@index([targetEntityType])
}
```

**Strengths:**
- ✅ Template reusability
- ✅ Usage analytics (usageCount, lastUsedAt)
- ✅ Target filtering by entity type and industry

**Concerns:**
- ⚠️ No `isSystem` flag to distinguish built-in vs custom templates
- ⚠️ `createdById` has no foreign key relation to User
- ⚠️ No `version` field for template versioning
- ⚠️ No `clonedFromId` for template lineage
- ⚠️ JSON fields lack validation
- ⚠️ Only one `isDefault` allowed per tenant (no validation constraint)

**Missing Indexes:**
```prisma
@@index([tenantId, isActive])  // For active templates
@@index([createdById])  // For "my templates" view
@@index([tenantId, targetEntityType, targetIndustry])  // For targeted filtering
```

---

### 3.12 PricingRule
```prisma
model PricingRule {
  id          String @id @default(uuid())
  name        String
  description String?
  
  conditionField    String
  conditionOperator String
  conditionValue    String // JSON string
  
  adjustmentType  String
  adjustmentValue Float
  
  priority Int     @default(0)
  isActive Boolean @default(true)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  serviceId String
  service   ServiceTemplate @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([serviceId])
  @@index([isActive])
}
```

**Strengths:**
- ✅ Flexible rule-based pricing engine
- ✅ Priority ordering for rule application
- ✅ Tenant-scoped rules

**Concerns:**
- ⚠️ `conditionOperator` and `adjustmentType` should be enums
- ⚠️ `conditionValue` as JSON string makes querying difficult
- ⚠️ No validation on `conditionField` against available fields
- ⚠️ No rule grouping or categories
- ⚠️ No `startDate`/`endDate` for time-bound rules

**Missing Indexes:**
```prisma
@@index([serviceId, isActive, priority DESC])  // For active rules in priority order
@@index([tenantId, isActive])  // For tenant rule listing
```

---

### 3.13 ActivityLog
```prisma
model ActivityLog {
  id         String   @id @default(uuid())
  action     String
  entityType String
  entityId   String?
  
  description String?
  metadata    String @default("{}")  // JSON
  ipAddress   String?
  userAgent   String?
  
  createdAt DateTime @default(now())
  
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  userId String?
  user   User? @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  proposalId String?
  proposal   Proposal? @relation(fields: [proposalId], references: [id], onDelete: SetNull)
  
  @@index([tenantId])
  @@index([userId])
  @@index([proposalId])
  @@index([entityType, entityId])
  @@index([createdAt])
}
```

**Strengths:**
- ✅ Comprehensive audit trail
- ✅ Generic entity reference (entityType + entityId)
- ✅ SetNull on user/proposal deletion preserves audit history
- ✅ Tenant isolation

**Concerns:**
- ⚠️ `action` should be enum for consistency (CREATE, UPDATE, DELETE, VIEW, etc.)
- ⚠️ `entityType` should be enum for consistency
- ⚠️ No `beforeValue`/`afterValue` for change tracking
- ⚠️ No retention policy configuration
- ⚠️ No severity/priority field for important events
- ⚠️ GDPR concern with IP address storage
- ⚠️ No bulk insert support (each action = one row)

**Missing Indexes:**
```prisma
@@index([tenantId, createdAt DESC])  // For recent activity feed
@@index([tenantId, action])  // For action-specific reports
@@index([userId, createdAt DESC])  // For user activity history
@@index([entityType, entityId, createdAt DESC])  // For entity timeline
```

---

## 4. Missing Models

### 4.1 Email Configuration Storage
**Status:** ❌ Not Implemented

The schema review requested email configuration storage analysis. Currently, there are NO models for:

```prisma
// RECOMMENDED: Email Configuration
model EmailSettings {
  id        String   @id @default(uuid())
  tenantId  String   @unique  // One per tenant
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // SMTP Configuration
  smtpHost      String?
  smtpPort      Int?
  smtpSecure    Boolean @default(true)
  smtpUser      String?
  smtpPassword  String?  // Encrypted
  
  // Sender Configuration
  fromName      String
  fromEmail     String
  replyToEmail  String?
  
  // Provider Integration
  provider      EmailProvider @default(SMTP)  // SMTP, SENDGRID, MAILGUN, OUTLOOK, GMAIL
  apiKey        String?  // For API-based providers (encrypted)
  
  // OAuth Settings (for Outlook/Gmail)
  oauthEnabled      Boolean @default(false)
  oauthAccessToken  String?  // Encrypted
  oauthRefreshToken String?  // Encrypted
  oauthExpiresAt    DateTime?
  
  // Feature Flags
  enabled       Boolean @default(true)
  trackOpens    Boolean @default(true)
  trackClicks   Boolean @default(false)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum EmailProvider {
  SMTP
  SENDGRID
  MAILGUN
  OUTLOOK
  GMAIL
  POSTMARK
}
```

**Impact:** Email settings likely stored in Tenant.settings JSON field, making:
- No type safety
- No validation
- Difficult to query/migrate
- Security concerns with credentials in JSON

### 4.2 User Invitation Model
```prisma
model UserInvitation {
  id        String   @id @default(uuid())
  email     String
  token     String   @unique
  role      UserRole
  invitedById String
  invitedBy   User   @relation(fields: [invitedById], references: [id])
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  expiresAt DateTime
  acceptedAt DateTime?
  createdAt DateTime @default(now())
  
  @@unique([email, tenantId])
  @@index([token])
  @@index([expiresAt])
}
```

### 4.3 Subscription/Billing Model
```prisma
model Subscription {
  id        String   @id @default(uuid())
  tenantId  String   @unique
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  plan      SubscriptionPlan
  status    SubscriptionStatus
  
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  
  stripeCustomerId     String?
  stripeSubscriptionId String?
  
  cancelAtPeriodEnd Boolean @default(false)
  canceledAt        DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum SubscriptionPlan {
  FREE
  STARTER
  PROFESSIONAL
  ENTERPRISE
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
  TRIALING
}
```

### 4.4 File/Asset Management Model
```prisma
model FileAsset {
  id          String @id @default(uuid())
  tenantId    String
  tenant      Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  name        String
  fileUrl     String
  fileType    String
  fileSize    Int
  checksum    String
  
  storageProvider StorageProvider
  
  uploadedById String
  uploadedBy   User   @relation(fields: [uploadedById], references: [id])
  
  entityType  String?  // Proposal, Client, etc.
  entityId    String?
  
  isPublic    Boolean @default(false)
  deletedAt   DateTime?
  
  createdAt   DateTime @default(now())
  
  @@index([tenantId])
  @@index([entityType, entityId])
  @@index([uploadedById])
}

enum StorageProvider {
  LOCAL
  AWS_S3
  AZURE_BLOB
  GOOGLE_CLOUD
}
```

---

## 5. Data Integrity Concerns

### 5.1 Critical Issues

| Issue | Severity | Description | Recommendation |
|-------|----------|-------------|----------------|
| Pricing Calculation | **HIGH** | `ProposalService.total` stored but calculated from other fields | Use computed property or add validation trigger |
| User Deletion Block | **HIGH** | `Proposal.createdBy` uses Restrict delete | Change to `SetNull` or implement user soft delete |
| Email Credentials | **HIGH** | Email settings likely in unencrypted JSON | Create EmailSettings model with encryption |
| Tag Storage | **MEDIUM** | Comma-separated strings in multiple tables | Create Tag and EntityTag junction tables |
| JSON Validation | **MEDIUM** | Multiple JSON fields without schema validation | Add JSON Schema validation at application layer |

### 5.2 Cascade Delete Analysis

```
┌────────────────────┬────────────────┬─────────────────────────────────────┐
│ Parent Table       │ Child Tables   │ Risk Assessment                     │
├────────────────────┼────────────────┼─────────────────────────────────────┤
│ Tenant             │ ALL except N/A │ 🔴 HIGH - Deletes all tenant data   │
│ User               │ RefreshToken   │ 🟢 LOW - Expected behavior          │
│                    │ ActivityLog    │ 🟢 LOW - SetNull preserves history  │
│                    │ Proposal       │ 🔴 HIGH - Restrict blocks deletion  │
│ Client             │ Proposal       │ 🔴 HIGH - Cascades to all proposals │
│ Proposal           │ ALL children   │ 🟡 MEDIUM - Expected but verify     │
│ ServiceTemplate    │ PricingRule    │ 🟢 LOW - Rules tied to service      │
│                    │ ProposalService│ 🔴 HIGH - Orphaned line items       │
└────────────────────┴────────────────┴─────────────────────────────────────┘
```

### 5.3 Multi-Tenancy Isolation Verification

✅ **All tenant-scoped tables have `tenantId` field:**
- User ✓
- Client ✓
- Proposal ✓
- ServiceTemplate ✓
- ProposalTemplate ✓
- PricingRule ✓
- ActivityLog ✓

⚠️ **Missing tenant isolation:**
- ProposalView (implicit via Proposal) ✓
- ProposalSignature (implicit via Proposal) ✓
- ProposalDocument (implicit via Proposal) ✓
- ProposalService (implicit via Proposal) ✓

---

## 6. Performance Optimization Recommendations

### 6.1 Index Additions

```sql
-- Dashboard Performance
CREATE INDEX CONCURRENTLY "idx_proposal_tenant_status_created" 
  ON "Proposal"("tenantId", "status", "createdAt" DESC);

-- Client Search
CREATE INDEX CONCURRENTLY "idx_client_tenant_name" 
  ON "Client"("tenantId", "name");

-- Activity Feed
CREATE INDEX CONCURRENTLY "idx_activity_tenant_created" 
  ON "ActivityLog"("tenantId", "createdAt" DESC);

-- Expired Proposal Cleanup Job
CREATE INDEX CONCURRENTLY "idx_proposal_status_validuntil" 
  ON "Proposal"("status", "validUntil") 
  WHERE "status" NOT IN ('ACCEPTED', 'DECLINED');

-- Service Category Browsing
CREATE INDEX CONCURRENTLY "idx_servicetemplate_tenant_category_active" 
  ON "ServiceTemplate"("tenantId", "category", "isActive");
```

### 6.2 Partitioning Recommendations

**ActivityLog Table:**
```sql
-- Partition by createdAt for large tenants
CREATE TABLE "ActivityLog" (
  -- columns
) PARTITION BY RANGE ("createdAt");

-- Create monthly partitions
CREATE TABLE "ActivityLog_2026_03" PARTITION OF "ActivityLog"
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

**ProposalView Table:**
```sql
-- High write volume, partition by proposalId hash
CREATE TABLE "ProposalView" (
  -- columns
) PARTITION BY HASH ("proposalId");
```

### 6.3 Query Optimization Patterns

**Avoid N+1 with Includes:**
```typescript
// GOOD: Fetches all in single query
prisma.proposal.findMany({
  include: {
    services: true,
    client: true,
    createdBy: { select: { firstName: true, lastName: true } }
  }
});

// BAD: Causes N+1 queries
const proposals = await prisma.proposal.findMany();
for (const p of proposals) {
  const services = await prisma.proposalService.findMany({ 
    where: { proposalId: p.id } 
  });
}
```

### 6.4 Connection Pooling

```
Recommended Settings:
- Pool Size: 10-20 connections per application instance
- Max Connections: 100 (PostgreSQL default)
- Connection Timeout: 5 seconds
- Idle Timeout: 5 minutes
```

---

## 7. Security Considerations

### 7.1 Data Classification

| Sensitivity | Fields | Protection Required |
|-------------|--------|---------------------|
| **Critical** | passwordHash, refreshTokens, signatureData | Encryption at rest, secure hashing |
| **High** | utr, companyNumber, vatNumber | Access logging, field-level encryption |
| **Medium** | ipAddress, userAgent | GDPR compliance, retention limits |
| **Low** | name, description, status | Standard access controls |

### 7.2 GDPR Compliance Gaps

| Requirement | Status | Action Needed |
|-------------|--------|---------------|
| Right to be forgotten | ⚠️ Partial | Add soft delete support |
| Data retention limits | ❌ Missing | Add retention policy for logs |
| Consent tracking | ❌ Missing | Add consent fields |
| IP address justification | ⚠️ Review | Document legal basis |

### 7.3 Recommended Security Enhancements

```prisma
// Add to User model
model User {
  // ... existing fields ...
  
  // Security
  failedLoginAttempts Int @default(0)
  lockedUntil         DateTime?
  passwordChangedAt   DateTime @default(now())
  twoFactorEnabled    Boolean @default(false)
  twoFactorSecret     String?  // Encrypted
  
  // Audit
  lastPasswordResetAt DateTime?
  invitationToken     String?  @unique
  invitedAt           DateTime?
  invitedById         String?
}
```

---

## 8. Migration Recommendations

### 8.1 Immediate (Next Sprint)

1. **Add missing indexes for performance**
2. **Create EmailSettings model**
3. **Add user security fields (failedLoginAttempts, lockedUntil)**
4. **Fix Proposal.createdBy cascade behavior**

### 8.2 Short-term (Next Month)

1. **Normalize tag storage** (new Tag and EntityTag tables)
2. **Add soft delete support** (deletedAt fields)
3. **Create UserInvitation model**
4. **Add subscription/billing models**

### 8.3 Long-term (Next Quarter)

1. **Proposal versioning system**
2. **ActivityLog partitioning**
3. **FileAsset model for centralized file management**
4. **JSON Schema validation layer**

---

## 9. Summary

### Schema Strengths ✅
- Solid multi-tenant architecture with proper isolation
- Comprehensive UK VAT and MTD ITSA compliance fields
- Good audit trail implementation
- Proper use of enums for type safety
- Well-defined cascade behaviors (mostly)

### Critical Issues 🔴
1. **User deletion blocked** by Proposal.createdBy Restrict constraint
2. **Email settings** not properly modeled (likely in JSON)
3. **Pricing consistency** risk with stored calculated fields
4. **Tag storage** as comma-separated strings

### Recommendations Summary

| Priority | Item | Effort |
|----------|------|--------|
| P0 | Fix Proposal.createdBy cascade | 1 hour |
| P0 | Add critical indexes | 2 hours |
| P1 | Create EmailSettings model | 4 hours |
| P1 | Add user security fields | 4 hours |
| P2 | Normalize tag storage | 8 hours |
| P2 | Add soft delete support | 8 hours |
| P3 | Proposal versioning | 16 hours |
| P3 | ActivityLog partitioning | 8 hours |

---

## Appendix: Prisma Schema Additions

### Recommended Additions to schema.prisma

```prisma
// ==================== SECURITY ENHANCEMENTS ====================

model User {
  // ... existing fields ...
  
  // Security fields (add these)
  failedLoginAttempts Int @default(0)
  lockedUntil         DateTime?
  passwordChangedAt   DateTime @default(now())
  twoFactorEnabled    Boolean @default(false)
  twoFactorSecret     String?  // Encrypted at application layer
  
  // Invitation
  invitationToken     String?  @unique
  invitedAt           DateTime?
  invitedById         String?
  
  // Soft delete
  deletedAt           DateTime?
  
  @@index([deletedAt])
  @@index([lockedUntil])
  @@index([invitationToken])
}

// ==================== EMAIL CONFIGURATION ====================

model EmailSettings {
  id        String   @id @default(uuid())
  tenantId  String   @unique
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // SMTP
  smtpHost     String?
  smtpPort     Int?
  smtpSecure   Boolean @default(true)
  smtpUser     String?
  smtpPassword String?  // Encrypted
  
  // Sender
  fromName     String
  fromEmail    String
  replyToEmail String?
  
  // Provider
  provider     EmailProvider @default(SMTP)
  apiKey       String?  // Encrypted
  
  // OAuth
  oauthEnabled      Boolean @default(false)
  oauthAccessToken  String?  // Encrypted
  oauthRefreshToken String?  // Encrypted
  oauthExpiresAt    DateTime?
  
  // Features
  enabled     Boolean @default(true)
  trackOpens  Boolean @default(true)
  trackClicks Boolean @default(false)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([tenantId])
  @@index([enabled])
}

enum EmailProvider {
  SMTP
  SENDGRID
  MAILGUN
  OUTLOOK
  GMAIL
  POSTMARK
}

// ==================== TAGGING SYSTEM ====================

model Tag {
  id        String   @id @default(uuid())
  name      String
  color     String   @default("#0ea5e9")
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  createdAt DateTime @default(now())
  
  entities  EntityTag[]
  
  @@unique([tenantId, name])
  @@index([tenantId])
}

model EntityTag {
  id         String @id @default(uuid())
  tagId      String
  tag        Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)
  
  entityType String // 'Client', 'ServiceTemplate', etc.
  entityId   String
  
  createdAt  DateTime @default(now())
  
  @@unique([tagId, entityType, entityId])
  @@index([entityType, entityId])
  @@index([tagId])
}

// ==================== SUBSCRIPTION ====================

model Subscription {
  id        String   @id @default(uuid())
  tenantId  String   @unique
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  plan      SubscriptionPlan
  status    SubscriptionStatus
  
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  
  stripeCustomerId     String?
  stripeSubscriptionId String?
  
  cancelAtPeriodEnd Boolean @default(false)
  canceledAt        DateTime?
  
  maxUsers          Int?
  maxProposals      Int?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([tenantId])
  @@index([status])
  @@index([currentPeriodEnd])
}

enum SubscriptionPlan {
  FREE
  STARTER
  PROFESSIONAL
  ENTERPRISE
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
  TRIALING
}
```

---

*End of Database Schema Review*
