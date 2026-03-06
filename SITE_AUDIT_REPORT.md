# Engage by Capstone - Comprehensive Site Audit Report

**Audit Date:** 2026-03-04  
**Auditor:** Kimi Code CLI  
**Project Location:** `C:\Users\willi\Cline Workspace\engage`

---

## Executive Summary

| Category | Status | Score |
|----------|--------|-------|
| Route Analysis | ✅ Pass | 100% |
| API Endpoint Analysis | ✅ Pass | 95% |
| Link Validation | ✅ Pass | 100% |
| Missing Pages | ✅ Pass | 100% |
| Code Quality | ⚠️ Warning | 75% |
| Environment Variables | ⚠️ Warning | 70% |
| **Overall Site Health** | **🟡 Good** | **90/100** |

---

## 1. Route Analysis

### Frontend React Router (App.tsx)

**Status:** ✅ All routes properly configured

| Route | Component | Status |
|-------|-----------|--------|
| `/login` | Login | ✅ Exists |
| `/register` | Onboarding | ✅ Exists |
| `/` | Dashboard | ✅ Exists |
| `/proposals` | Proposals | ✅ Exists |
| `/proposals/new` | CreateProposal | ✅ Exists |
| `/proposals/:id` | ProposalDetail | ✅ Exists |
| `/clients` | Clients | ✅ Exists |
| `/clients/new` | CreateClient | ✅ Exists |
| `/clients/:id` | ClientDetail | ✅ Exists |
| `/services` | Services | ✅ Exists |
| `/services/:id` | ServiceDetail | ✅ Exists |
| `/settings` | Settings | ✅ Exists |
| `/subscription` | Subscription | ✅ Exists |
| `/proposals/view/:token` | PublicProposalView | ✅ Exists |
| `*` | NotFound | ✅ Exists |

**Findings:**
- ✅ All imported components exist
- ✅ No duplicate routes found
- ✅ Route paths are consistent
- ✅ Proper use of ProtectedRoute and PublicRoute wrappers

---

## 2. API Endpoint Analysis

### Backend Routes (index.ts)

**Status:** ✅ All routes properly registered

| Route | Router File | Authentication | Notes |
|-------|-------------|----------------|-------|
| `/api/auth` | auth.ts | Mixed | Public login/register, protected user management |
| `/api/proposals` | proposals.ts | Required | Core proposal CRUD |
| `/api/proposals` | proposals-share.ts | Mixed | Public share routes + authenticated routes |
| `/api/clients` | clients.ts | Required | Client management |
| `/api/services` | services.ts | Required | Service templates |
| `/api/services/v2` | services-new.ts | Required | Enhanced service catalog |
| `/api/tenants` | tenants.ts | Mixed | Public onboarding, protected settings |
| `/api/email` | email.ts | Required | Email configuration & OAuth |
| `/api/payments` | payments.ts | Required | Stripe integration |
| `/api/companies-house` | companiesHouse.ts | Required | Companies House API |

**Potential Conflict:**
- ⚠️ `/api/proposals` is used by both `proposalRoutes` and `proposalShareRoutes` - both mounted but no conflicting paths

**Health Endpoints:**
- ✅ `GET /health` - Available
- ✅ `GET /api/health` - Available
- ✅ `GET /api/status` - Available

---

## 3. Link Validation

### Sidebar Navigation (Sidebar.tsx)

| Link | Target Route | Status |
|------|--------------|--------|
| Dashboard | `/` | ✅ Valid |
| Proposals | `/proposals` | ✅ Valid |
| Clients | `/clients` | ✅ Valid |
| Services | `/services` | ✅ Valid |
| Billing | `/subscription` | ✅ Valid |
| Settings | `/settings` | ✅ Valid |

### Header Navigation (Header.tsx)

| Link | Target Route | Status |
|------|--------------|--------|
| New Proposal | `/proposals/new` | ✅ Valid |
| New Client | `/clients/new` | ✅ Valid |
| Profile | `/settings` | ✅ Valid |

### Dashboard Links (Dashboard.tsx)

| Link | Target Route | Status |
|------|--------------|--------|
| New Proposal | `/proposals/new` | ✅ Valid |
| Add Client | `/clients/new` | ✅ Valid |
| Services | `/services` | ✅ Valid |
| Review clients | `/clients` | ✅ Valid |
| View all (proposals) | `/proposals` | ✅ Valid |
| View all (clients) | `/clients` | ✅ Valid |

**Findings:**
- ✅ All navigation links match defined routes
- ✅ No broken links detected

---

## 4. Missing Pages Check

**Status:** ✅ All referenced components exist

| Component | File Path | Status |
|-----------|-----------|--------|
| DashboardLayout | `components/layout/DashboardLayout.tsx` | ✅ Exists |
| AuthLayout | `components/layout/AuthLayout.tsx` | ✅ Exists |
| Login | `pages/auth/Login.tsx` | ✅ Exists |
| Register | `pages/auth/Register.tsx` | ✅ Exists |
| Onboarding | `pages/auth/Onboarding.tsx` | ✅ Exists |
| Dashboard | `pages/Dashboard.tsx` | ✅ Exists |
| Proposals | `pages/proposals/Proposals.tsx` | ✅ Exists |
| ProposalDetail | `pages/proposals/ProposalDetail.tsx` | ✅ Exists |
| CreateProposal | `pages/proposals/CreateProposal.tsx` | ✅ Exists |
| Clients | `pages/clients/Clients.tsx` | ✅ Exists |
| ClientDetail | `pages/clients/ClientDetail.tsx` | ✅ Exists |
| CreateClient | `pages/clients/CreateClient.tsx` | ✅ Exists |
| Services | `pages/services/Services.tsx` | ✅ Exists |
| ServiceDetail | `pages/services/ServiceDetail.tsx` | ✅ Exists |
| Settings | `pages/Settings.tsx` | ✅ Exists |
| Subscription | `pages/Subscription.tsx` | ✅ Exists |
| NotFound | `pages/NotFound.tsx` | ✅ Exists |
| PublicProposalView | `pages/public/ProposalView.tsx` | ✅ Exists |

---

## 5. Code Quality Issues

### Console.log Statements (Should be removed for production)

**Frontend (`engage/frontend/src`):**

| File | Line | Statement | Severity |
|------|------|-----------|----------|
| `utils/api.ts` | 8 | `console.log('API URL:', API_URL)` | 🔴 High |
| `pages/Dashboard.tsx` | 120 | `console.error('Failed to load dashboard data', error)` | 🟡 Low |
| `pages/clients/ClientDetail.tsx` | 58 | `console.error('Failed to load client', error)` | 🟡 Low |
| `pages/clients/Clients.tsx` | 38 | `console.error('Failed to load clients', error)` | 🟡 Low |
| `pages/clients/CreateClient.tsx` | 83-84 | Form debug logs | 🔴 High |
| `pages/clients/CreateClient.tsx` | 155 | `console.log('Form submitted with data:', data)` | 🔴 High |
| `pages/clients/CreateClient.tsx` | 159 | `console.log('Calling createClient API...')` | 🔴 High |
| `pages/clients/CreateClient.tsx` | 194 | `console.error('Create client error:', error)` | 🟡 Low |
| `pages/clients/CreateClient.tsx` | 242 | `console.log('Validation errors:', errors)` | 🔴 High |
| `pages/clients/CreateClient.tsx` | 520 | Inline console.log on click | 🔴 High |
| `pages/proposals/Proposals.tsx` | 25 | `console.log('Icons loaded:', _iconRefs.length)` | 🔴 High |
| `pages/proposals/Proposals.tsx` | 70 | `console.error('Failed to load proposals', error)` | 🟡 Low |
| `pages/proposals/Proposals.tsx` | 94 | `console.error('Failed to download PDF', error)` | 🟡 Low |
| `pages/proposals/CreateProposal.tsx` | 164 | `console.error('Failed to load data', error)` | 🟡 Low |
| `pages/proposals/CreateProposal.tsx` | 282 | `console.error('Failed to save proposal', error)` | 🟡 Low |
| `pages/proposals/ProposalDetail.tsx` | 54, 108, 118, 154 | Error logs | 🟡 Low |
| `pages/Settings.tsx` | Multiple | Debug logs (lines 133, 191, 201, 211, 221, 242, 250, 260, 270, 278) | 🔴 High |
| `pages/Subscription.tsx` | 51, 63 | Error logs | 🟡 Low |

**Backend (`engage/backend/src`):**

| File | Line | Statement | Severity |
|------|------|-----------|----------|
| `index.ts` | 99 | `console.warn('CORS blocked for origin: ${origin}')` | 🟢 Acceptable |
| `middleware/tenant.ts` | 51 | `console.error('Tenant extraction error:', error)` | 🟢 Acceptable |
| `config/redis.ts` | 14, 18 | Redis connection logs | 🟢 Acceptable |
| `scripts/seedServices.ts` | Multiple | Seed script logs | 🟢 Acceptable (dev only) |
| `routes/payments.ts` | 311 | Webhook error log | 🟢 Acceptable |

### TODO Comments

| File | Line | Comment |
|------|------|---------|
| `routes/proposals-share.ts` | 201 | `// TODO: Generate PDF - for now we'll skip attachment` |
| `routes/proposals-share.ts` | 514 | `// TODO: Get practice notification email from settings` |
| `routes/proposals-share.ts` | 570 | `// TODO: Generate and return PDF` |

### Unused Imports Check

**Status:** ✅ No obvious unused imports detected in scanned files

### Hardcoded Values

| File | Line | Value | Recommendation |
|------|------|-------|----------------|
| `backend/src/index.ts` | 208, 213, 218 | `'https://engagebycapstone.co.uk'` | ✅ Uses env var with fallback |
| `backend/src/routes/email.ts` | 464, 504-521 | `'https://engage-by-capstone-production.up.railway.app'` | ✅ Uses env var with fallback |
| `backend/src/services/proposalSharingService.ts` | 35, 396 | `'.engage.capstone.co.uk'` | ⚠️ Consider env var |

---

## 6. Environment Variable Audit

### Backend Environment Variables

**Documented in `.env.production.template`:**

| Variable | Status |
|----------|--------|
| NODE_ENV | ✅ Documented |
| PORT | ✅ Documented |
| JWT_SECRET | ✅ Documented |
| DATABASE_URL | ✅ Documented |
| FRONTEND_URL | ✅ Documented |
| CORS_ORIGINS | ✅ Documented |
| EMAIL_PROVIDER | ✅ Documented |
| SMTP_HOST | ✅ Documented |
| SMTP_PORT | ✅ Documented |
| SMTP_SECURE | ✅ Documented |
| SMTP_USER | ✅ Documented |
| SMTP_PASS | ✅ Documented |
| GMAIL_CLIENT_ID | ✅ Documented |
| GMAIL_CLIENT_SECRET | ✅ Documented |
| GMAIL_REFRESH_TOKEN | ✅ Documented |
| GMAIL_USER | ✅ Documented |
| MICROSOFT_CLIENT_ID | ✅ Documented |
| MICROSOFT_CLIENT_SECRET | ✅ Documented |
| MICROSOFT_REFRESH_TOKEN | ✅ Documented |
| MICROSOFT_USER | ✅ Documented |
| STRIPE_PUBLISHABLE_KEY | ✅ Documented |
| STRIPE_SECRET_KEY | ✅ Documented |
| STRIPE_WEBHOOK_SECRET | ✅ Documented |
| STRIPE_STARTER_PRICE_ID | ✅ Documented |
| STRIPE_PROFESSIONAL_PRICE_ID | ✅ Documented |
| STRIPE_ENTERPRISE_PRICE_ID | ✅ Documented |
| RATE_LIMIT_MAX | ✅ Documented |
| AUTH_RATE_LIMIT_MAX | ✅ Documented |
| MAX_FILE_SIZE | ✅ Documented |
| LOG_LEVEL | ✅ Documented |
| JWT_EXPIRES_IN | ✅ Documented |
| REFRESH_TOKEN_EXPIRES_IN | ✅ Documented |

**Used in code but NOT documented:**

| Variable | Usage Location | Risk Level |
|----------|----------------|------------|
| COMPANIES_HOUSE_API_KEY | `services/companiesHouse.ts:191` | 🔴 High |
| PUBLIC_PROPOSAL_URL | `services/proposalSharingService.ts:35, 396`, `routes/proposals-share.ts:183` | 🟡 Medium |
| API_URL | `routes/email.ts:464, 546` | 🔴 High |
| EMAIL_FROM | `routes/proposals.ts:483` | 🟡 Medium |
| REDIS_URL | `config/redis.ts:3` | 🟡 Medium |
| npm_package_version | `index.ts:170` | 🟢 Low |

### Frontend Environment Variables

**Documented:**

| Variable | Status |
|----------|--------|
| VITE_API_URL | ✅ Documented |

---

## 7. Security Observations

### Positive Security Measures

✅ **Helmet.js** configured with CSP  
✅ **CORS** properly configured with allowlist  
✅ **Rate limiting** implemented (100 req/15min general, 10 req/15min auth)  
✅ **JWT** authentication with refresh tokens  
✅ **Password hashing** with bcrypt (12 rounds)  
✅ **SQL injection protection** via Prisma ORM  
✅ **Input validation** with Zod schemas  
✅ **Tenant isolation** middleware  

### Security Recommendations

⚠️ Console logs may expose sensitive data in production  
⚠️ Consider implementing request signing for webhook endpoints  
⚠️ Add API request logging for audit trails  

---

## 8. Recommendations

### High Priority

1. **Remove debug console.log statements** from frontend before production deployment
   - Priority files: `CreateClient.tsx`, `Settings.tsx`, `api.ts`, `Proposals.tsx`

2. **Document missing environment variables** in `.env.production.template`:
   - `COMPANIES_HOUSE_API_KEY`
   - `PUBLIC_PROPOSAL_URL`
   - `API_URL`
   - `EMAIL_FROM`
   - `REDIS_URL`

### Medium Priority

3. **Complete TODO items**:
   - PDF generation for proposals
   - Practice notification email configuration

4. **Standardize OAuth callback URLs** to use consistent env var patterns

### Low Priority

5. **Add health check endpoint** for frontend build verification
6. **Consider adding Sentry or similar** for production error tracking

---

## Appendix: Project Structure

```
engage/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── billing/
│   │   │   ├── email/
│   │   │   ├── layout/
│   │   │   ├── payments/
│   │   │   ├── proposals/
│   │   │   ├── services/
│   │   │   └── signature/
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── clients/
│   │   │   ├── proposals/
│   │   │   ├── public/
│   │   │   └── services/
│   │   ├── stores/
│   │   └── utils/
│   ├── .env
│   └── .env.production
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── data/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   └── templates/
│   └── .env.production.template
└── SITE_AUDIT_REPORT.md (this file)
```

---

## Conclusion

The Engage by Capstone application is in **good overall health** with a site score of **90/100**. The routing, API endpoints, and navigation are well-structured and consistent. The main areas for improvement are:

1. **Code cleanup**: Remove debug console.log statements before production
2. **Documentation**: Add missing environment variables to the template
3. **Feature completion**: Address the TODO items for PDF generation

No critical issues were found that would prevent the application from functioning correctly.

---

*Report generated by Kimi Code CLI on 2026-03-04*
