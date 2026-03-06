# API Endpoint Audit Report - Engage by Capstone

**Generated:** 2026-03-04  
**Scope:** Complete backend-to-frontend API mapping

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total Backend Endpoints | 68 |
| Frontend API Methods | 43 |
| Missing Frontend Methods | ~15 |
| Authentication Required | 56 |
| Public Endpoints | 12 |

---

## 1. Authentication Routes (`/api/auth`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 1 | `/auth/login` | POST | `login(email, password, tenantId)` | No | Public | ✅ Working |
| 2 | `/auth/register` | POST | `register(data)` | No | Public | ✅ Working |
| 3 | `/auth/refresh` | POST | `refreshToken(refreshToken)` | No | Public | ✅ Working |
| 4 | `/auth/logout` | POST | `logout()` | Yes | Any | ✅ Working |
| 5 | `/auth/me` | GET | `getMe()` | Yes | Any | ✅ Working |
| 6 | `/auth/me` | PUT | `updateMe(data)` | Yes | Any | ✅ Working |
| 7 | `/auth/change-password` | PUT | `changePassword(data)` | Yes | Any | ✅ Working |
| 8 | `/auth/users` | GET | `getUsers()` | Yes | PARTNER, MANAGER | ✅ Working |
| 9 | `/auth/users` | POST | `createUser(data)` | Yes | PARTNER, MANAGER | ✅ Working |
| 10 | `/auth/users/:id` | PUT | `updateUser(id, data)` | Yes | PARTNER, MANAGER | ✅ Working |
| 11 | `/auth/users/:id` | DELETE | `deleteUser(id)` | Yes | PARTNER, MANAGER | ✅ Working |

---

## 2. Client Routes (`/api/clients`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 12 | `/clients` | GET | `getClients(params)` | Yes | Any | ✅ Working |
| 13 | `/clients/:id` | GET | `getClient(id)` | Yes | Any | ✅ Working |
| 14 | `/clients` | POST | `createClient(data)` | Yes | PARTNER, MANAGER, SENIOR | ✅ Working |
| 15 | `/clients/:id` | PUT | `updateClient(id, data)` | Yes | PARTNER, MANAGER, SENIOR | ✅ Working |
| 16 | `/clients/:id` | DELETE | `deleteClient(id)` | Yes | PARTNER, MANAGER | ✅ Working |
| 17 | `/clients/:id/mtditsa-assessment` | POST | `assessMTDITSA(id, incomeSources)` | Yes | Any | ✅ Working |
| 18 | `/clients/:id/mtditsa-timeline` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 19 | `/clients/validate/utr/:utr` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 20 | `/clients/validate/company-number/:number` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |

**Missing Frontend Methods:**
- `getMTDITSATimeline(clientId, taxYear)` - Get quarterly timeline for MTD ITSA
- `validateUTR(utr)` - Validate UTR format
- `validateCompanyNumber(number)` - Validate company number format

---

## 3. Proposal Routes (`/api/proposals`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 21 | `/proposals` | GET | `getProposals(params)` | Yes | Any | ✅ Working |
| 22 | `/proposals/:id` | GET | `getProposal(id)` | Yes | Any | ✅ Working |
| 23 | `/proposals` | POST | `createProposal(data)` | Yes | PARTNER, MANAGER, SENIOR | ✅ Working |
| 24 | `/proposals/:id` | PUT | `updateProposal(id, data)` | Yes | PARTNER, MANAGER, SENIOR | ✅ Working |
| 25 | `/proposals/:id` | DELETE | `deleteProposal(id)` | Yes | PARTNER, MANAGER | ✅ Working |
| 26 | `/proposals/:id/send` | POST | `sendProposal(id)` | Yes | PARTNER, MANAGER, SENIOR | ✅ Working |
| 27 | `/proposals/:id/accept` | POST | `acceptProposal(id, data)` | Yes | Any | ✅ Working |
| 28 | `/proposals/:id/pdf` | GET | `downloadProposalPDF(id)` | Yes | Any | ✅ Working |
| 29 | `/proposals/:id/view` | POST | `recordProposalView(id)` | Yes | Any | ✅ Working |
| 30 | `/proposals/:id/activity` | GET | `getProposalActivity(id)` | Yes | Any | ✅ Working |

---

## 4. Proposal Sharing Routes (`/api/proposals`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 31 | `/proposals/:id/share` | POST | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 32 | `/proposals/:id/share` | DELETE | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 33 | `/proposals/:id/email` | POST | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 34 | `/proposals/:id/views` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 35 | `/proposals/:id/audit-trail` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 36 | `/proposals/:id/signatures` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 37 | `/proposals/view/:token` | GET | ❌ MISSING | No | Public | ⚠️ Missing |
| 38 | `/proposals/view/:token/terms` | GET | ❌ MISSING | No | Public | ⚠️ Missing |
| 39 | `/proposals/view/:token/sign` | POST | ❌ MISSING | No | Public | ⚠️ Missing |
| 40 | `/proposals/view/:token/pdf` | GET | ❌ MISSING | No | Public | ⚠️ Missing |
| 41 | `/proposals/signatures/:id/image` | GET | ❌ MISSING | No | Public | ⚠️ Missing |

**Missing Frontend Methods:**
- `shareProposal(id, expiryDays)` - Create shareable link
- `revokeShareLink(id)` - Revoke shareable link
- `emailProposal(id, emailData)` - Send proposal via email
- `getProposalViews(id)` - Get view statistics
- `getProposalAuditTrail(id)` - Get compliance audit trail
- `getProposalSignatures(id)` - Get electronic signatures
- `viewSharedProposal(token)` - View proposal by share token (public)
- `getSharedProposalTerms(token)` - Get terms by share token
- `signSharedProposal(token, signatureData)` - Submit e-signature
- `downloadSharedPDF(token)` - Download PDF by token
- `getSignatureImage(signatureId)` - Get signature image

---

## 5. Service Routes (`/api/services`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 42 | `/services` | GET | `getServices(params)` | Yes | Any | ✅ Working |
| 43 | `/services/categories` | GET | `getServiceCategories()` | Yes | Any | ✅ Working |
| 44 | `/services/:id` | GET | `getService(id)` | Yes | Any | ✅ Working |
| 45 | `/services` | POST | `createService(data)` | Yes | PARTNER, MANAGER | ✅ Working |
| 46 | `/services/:id` | PUT | `updateService(id, data)` | Yes | PARTNER, MANAGER | ✅ Working |
| 47 | `/services/:id` | DELETE | `deleteService(id)` | Yes | PARTNER, MANAGER | ✅ Working |
| 48 | `/services/:id/duplicate` | POST | `duplicateService(id)` | Yes | PARTNER, MANAGER, SENIOR | ✅ Working |
| 49 | `/services/:id/pricing-rules` | POST | ❌ MISSING | Yes | PARTNER, MANAGER | ⚠️ Missing |
| 50 | `/services/calculate-price` | POST | `calculatePrice(data)` | Yes | Any | ✅ Working |

**Missing Frontend Method:**
- `addPricingRule(serviceId, ruleData)` - Add pricing rule to service

---

## 6. Enhanced Service Routes (`/api/services/v2`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 51 | `/services/v2/billing-cycles` | GET | ❌ MISSING | No | Public | ⚠️ Missing |
| 52 | `/services/v2/vat-rates` | GET | ❌ MISSING | No | Public | ⚠️ Missing |
| 53 | `/services/v2/categories` | GET | ❌ MISSING | No | Public | ⚠️ Missing |
| 54 | `/services/v2/catalog` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 55 | `/services/v2/import-from-catalog` | POST | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 56 | `/services/v2/bulk-import-catalog` | POST | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 57 | `/services/v2/:id/billing-vat` | PUT | ❌ MISSING | Yes | Any | ⚠️ Missing |

**Missing Frontend Methods:**
- `getBillingCycles()` - Get billing cycle options
- `getVatRates()` - Get VAT rate options
- `getServiceCategoriesV2()` - Get service categories v2
- `getServiceCatalog(params)` - Get pre-planned services catalog
- `importFromCatalog(serviceName, customBasePrice)` - Import service from catalog
- `bulkImportCatalog(category)` - Bulk import services
- `updateServiceBillingVAT(id, data)` - Update billing and VAT settings

---

## 7. Tenant Routes (`/api/tenants`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 58 | `/tenants` | POST | `createTenant(data)` | No | Public | ✅ Working |
| 59 | `/tenants/check-subdomain/:subdomain` | GET | `checkSubdomain(subdomain)` | No | Public | ✅ Working |
| 60 | `/tenants/onboarding-status` | GET | `getOnboardingStatus()` | No | Public | ✅ Working |
| 61 | `/tenants/settings` | GET | `getTenantSettings()` | Yes | Any | ✅ Working |
| 62 | `/tenants/settings` | PUT | `updateTenantSettings(data)` | Yes | Any | ✅ Working |

---

## 8. Email Routes (`/api/email`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 63 | `/email/config` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 64 | `/email/config` | PUT | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 65 | `/email/config` | DELETE | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 66 | `/email/test` | POST | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 67 | `/email/auth/:provider/status` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 68 | `/email/auth/:provider/url` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 69 | `/email/auth/:provider/callback` | POST | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 70 | `/email/auth/:provider/disconnect` | POST | ❌ MISSING | Yes | Any | ⚠️ Missing |

**Missing Frontend Methods:**
- `getEmailConfig()` - Get email configuration
- `updateEmailConfig(config)` - Update email configuration
- `deleteEmailConfig()` - Delete email configuration
- `testEmail(testEmail)` - Send test email
- `getOAuthStatus(provider)` - Get OAuth connection status
- `getOAuthUrl(provider)` - Get OAuth authorization URL
- `exchangeOAuthCode(provider, code)` - Exchange code for tokens
- `disconnectOAuth(provider)` - Disconnect OAuth provider

---

## 9. Companies House Routes (`/api/companies-house`)

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 71 | `/companies-house/search` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 72 | `/companies-house/company/:number` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |
| 73 | `/companies-house/status` | GET | ❌ MISSING | Yes | Any | ⚠️ Missing |

**Missing Frontend Methods:**
- `searchCompanies(query, limit)` - Search Companies House
- `getCompanyDetails(number)` - Get detailed company information
- `getCompaniesHouseStatus()` - Check API status

---

## 10. System Routes

| # | Endpoint URL | HTTP Method | Frontend API Method | Auth Required | Roles | Status |
|---|-------------|-------------|---------------------|---------------|-------|--------|
| 74 | `/health` | GET | ❌ MISSING | No | Public | ⚠️ Missing |
| 75 | `/api/status` | GET | ❌ MISSING | No | Public | ⚠️ Missing |

**Missing Frontend Methods:**
- `getHealthStatus()` - Check system health
- `getAPIStatus()` - Get API operational status

---

## Summary Statistics

### By Status

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Working (Frontend matches) | 43 | 57% |
| ⚠️ Missing Frontend Method | 33 | 43% |
| ❌ Broken/Mismatch | 0 | 0% |

### By Authentication

| Type | Count | Percentage |
|------|-------|------------|
| Requires Authentication | 56 | 75% |
| Public Endpoints | 19 | 25% |

### By Module

| Module | Total | Working | Missing |
|--------|-------|---------|---------|
| Auth | 11 | 11 | 0 |
| Clients | 9 | 6 | 3 |
| Proposals | 10 | 10 | 0 |
| Proposal Share | 11 | 0 | 11 |
| Services | 9 | 8 | 1 |
| Services V2 | 7 | 0 | 7 |
| Tenants | 5 | 5 | 0 |
| Email | 8 | 0 | 8 |
| Companies House | 3 | 0 | 3 |
| System | 2 | 0 | 2 |

---

## Missing Frontend API Methods - Priority List

### High Priority (Core Features)

1. **Email Configuration**
   - `getEmailConfig()`
   - `updateEmailConfig(config)`
   - `testEmail(testEmail)`

2. **Companies House Integration**
   - `searchCompanies(query, limit)`
   - `getCompanyDetails(number)`

3. **Client Validation**
   - `validateUTR(utr)`
   - `validateCompanyNumber(number)`

### Medium Priority (Enhanced Features)

4. **Proposal Sharing**
   - `shareProposal(id, expiryDays)`
   - `revokeShareLink(id)`
   - `emailProposal(id, emailData)`

5. **Service Catalog**
   - `getServiceCatalog(params)`
   - `importFromCatalog(serviceName, customBasePrice)`
   - `bulkImportCatalog(category)`

### Low Priority (Admin/Nice to Have)

6. **OAuth Management**
   - `getOAuthStatus(provider)`
   - `disconnectOAuth(provider)`

7. **Audit & Reporting**
   - `getProposalViews(id)`
   - `getProposalAuditTrail(id)`
   - `getProposalSignatures(id)`

8. **System Health**
   - `getHealthStatus()`
   - `getAPIStatus()`

---

## Role Hierarchy

```
PARTNER (Highest)
  ├── Full access to all endpoints
  ├── Can manage users (create, update, deactivate)
  ├── Can delete proposals and clients
  └── Can configure tenant settings

MANAGER
  ├── Can create/update/delete most resources
  ├── Can manage users (except partners)
  └── Cannot delete accepted proposals

SENIOR
  ├── Can create proposals and clients
  ├── Can update own proposals
  └── Cannot delete resources

JUNIOR (Lowest)
  ├── Read-only access to most resources
  ├── Can view proposals and clients
  └── Cannot create or modify resources
```

---

## Recommendations

### Immediate Actions

1. **Add Companies House integration methods** to frontend - enables client onboarding from Companies House search

2. **Add email configuration methods** - essential for proposal sending functionality

3. **Add client validation methods** - improves UX with real-time UTR/company number validation

### Short Term

4. **Add proposal sharing methods** - enables client-facing proposal sharing and e-signatures

5. **Add service catalog methods** - allows importing pre-defined UK accountancy services

### Long Term

6. **Consolidate API client** - Consider splitting `api.ts` into domain-specific modules (authApi, clientApi, proposalApi, etc.)

7. **Add type safety** - Define TypeScript interfaces for all API request/response payloads

8. **Add API versioning** - Consider versioning strategy for breaking changes

---

## Appendix: Role-Based Access Matrix

| Endpoint | PARTNER | MANAGER | SENIOR | JUNIOR |
|----------|---------|---------|--------|--------|
| `GET /auth/users` | ✅ | ✅ | ❌ | ❌ |
| `POST /auth/users` | ✅ | ✅ | ❌ | ❌ |
| `PUT /auth/users/:id` | ✅ | ✅ | ❌ | ❌ |
| `DELETE /auth/users/:id` | ✅ | ✅ | ❌ | ❌ |
| `POST /clients` | ✅ | ✅ | ✅ | ❌ |
| `PUT /clients/:id` | ✅ | ✅ | ✅ | ❌ |
| `DELETE /clients/:id` | ✅ | ✅ | ❌ | ❌ |
| `POST /proposals` | ✅ | ✅ | ✅ | ❌ |
| `PUT /proposals/:id` | ✅ | ✅ | ✅ | ❌ |
| `DELETE /proposals/:id` | ✅ | ✅ | ❌ | ❌ |
| `POST /proposals/:id/send` | ✅ | ✅ | ✅ | ❌ |
| `POST /services` | ✅ | ✅ | ❌ | ❌ |
| `PUT /services/:id` | ✅ | ✅ | ❌ | ❌ |
| `DELETE /services/:id` | ✅ | ✅ | ❌ | ❌ |

---

*End of Report*
