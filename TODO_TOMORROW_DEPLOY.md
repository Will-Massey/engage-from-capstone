# 🚀 DEPLOYMENT DAY TODO - Engage by Capstone

**Date:** March 5, 2026  
**Goal:** Deploy to Railway/Neon with all critical fixes  
**Status:** 🔴 CRITICAL FIXES REQUIRED BEFORE DEPLOY

---

## 🔴 CRITICAL - Must Fix Before Deploy (4-6 hours)

### 1. Security Fixes (2 hours)
- [ ] **Fix CSP Configuration** (`backend/src/index.ts`)
  - Remove `contentSecurityPolicy: false`
  - Implement proper CSP directives
  - Allow only necessary external resources
  
- [ ] **Fix JWT Secret** (`backend/src/middleware/auth.ts`)
  - Remove fallback secret
  - Throw error if JWT_SECRET not set
  - Add startup validation
  
- [ ] **Fix SMTP TLS** (`backend/src/services/emailService.ts`)
  - Remove `rejectUnauthorized: false`
  - Enable proper certificate validation

### 2. Fix Services Page Loading (1 hour)
- [ ] **Debug Services API Call**
  - Check API endpoint `/api/services` response
  - Fix frontend Services.tsx loading state
  - Handle empty/null data cases
  
- [ ] **Verify Service Data Flow**
  - Backend: Check serviceRoutes.ts
  - Frontend: Check api.ts getServices method
  - Check CORS for services endpoint

### 3. Fix Company Settings Save (1 hour)
- [ ] **Debug Settings API**
  - Add console logging to trace request/response
  - Check tenant settings endpoint
  - Verify JWT token is being sent
  
- [ ] **Fix Network Error**
  - Check if backend is receiving the request
  - Validate request payload format
  - Check for validation errors

### 4. Fix Cover Letter Display (30 min)
- [ ] **Check Proposal Creation**
  - Verify coverLetter field is being saved
  - Check proposal detail page displays coverLetter
  - Test with actual proposal data

---

## 🟡 HIGH PRIORITY - Fix Today (4-6 hours)

### 5. Missing API Methods (2 hours)
- [ ] **Add Missing Email API Methods** to `frontend/src/utils/api.ts`
  ```typescript
  getEmailSettings: () => api.get('/email/settings'),
  updateEmailSettings: (data) => api.put('/email/settings', data),
  testEmailConnection: (data) => api.post('/email/test', data),
  // ... OAuth methods
  ```
  
- [ ] **Add Missing Proposal Methods**
  ```typescript
  editProposal: (id, data) => api.put(`/proposals/${id}`, data),
  getProposalShareLink: (id) => api.post(`/proposals/${id}/share`),
  recordSignature: (id, data) => api.post(`/proposals/${id}/signature`, data),
  ```

### 6. Database Migrations (1 hour)
- [ ] **Create Migration for Critical Fixes**
  ```bash
  cd engage/backend
  npx prisma migrate dev --name pre_deploy_fixes
  ```
  
- [ ] **Add Performance Indexes**
  - Proposal.status + tenantId
  - Client.name + tenantId
  - ActivityLog.createdAt + tenantId

### 7. Fix CORS for Production (30 min)
- [ ] **Update CORS Configuration**
  - Add Railway frontend URL
  - Add custom domain if configured
  - Keep development origins for testing

### 8. Environment Variables Setup (30 min)
- [ ] **Create .env.production template**
  ```bash
  DATABASE_URL="postgresql://..."
  JWT_SECRET=""
  FRONTEND_URL=""
  EMAIL_PROVIDER=""
  SMTP_HOST=""
  SMTP_PORT=""
  SMTP_USER=""
  SMTP_PASS=""
  ```

---

## 🟢 MEDIUM PRIORITY - Nice to Have (3-4 hours)

### 9. Error Handling Improvements (1 hour)
- [ ] **Add Better Error Messages**
  - Network error: "Cannot connect to server"
  - 401: "Session expired, please log in"
  - 403: "You don't have permission"
  - 500: "Server error, please try again"

### 10. Loading States (1 hour)
- [ ] **Add Skeleton Loaders**
  - Dashboard cards
  - Proposal list
  - Client list
  - Service grid

### 11. Dashboard Real Data (1 hour)
- [ ] **Replace Mock Data**
  - Connect stats to actual API
  - Load recent proposals
  - Load recent clients
  - Load upcoming deadlines

### 12. Form Validation (1 hour)
- [ ] **Add Client-Side Validation**
  - Required field indicators
  - Email format validation
  - Phone number validation
  - Numeric field validation

---

## 📋 DEPLOYMENT CHECKLIST

### Pre-Deploy (30 min)
- [ ] All tests passing
- [ ] Build successful (`npm run build`)
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Security audit fixes complete

### Railway Setup (1 hour)
- [ ] Create new Railway project
- [ ] Add PostgreSQL database
- [ ] Deploy backend service
- [ ] Deploy frontend service
- [ ] Configure environment variables
- [ ] Set up custom domain (optional)

### Neon Database (30 min)
- [ ] Create Neon project
- [ ] Run migrations
- [ ] Seed with demo data
- [ ] Configure connection pooling

### Post-Deploy Verification (30 min)
- [ ] Login works
- [ ] Dashboard loads
- [ ] Proposals CRUD works
- [ ] Clients CRUD works
- [ ] Services load
- [ ] Settings save
- [ ] Email sending works

---

## 🐛 KNOWN ISSUES TO VERIFY

| Issue | Status | Notes |
|-------|--------|-------|
| Services page not loading | 🔴 CRITICAL | Needs investigation |
| Cover letter not showing | 🔴 CRITICAL | Check proposal data flow |
| Company save network error | 🔴 CRITICAL | API endpoint issue? |
| Dashboard mock data | 🟡 HIGH | Replace with real data |
| Missing proposal edit | 🟡 HIGH | Add edit functionality |
| Header search broken | 🟢 MEDIUM | Add search API |
| Documents tab empty | 🟢 MEDIUM | Implement file upload |

---

## 📁 FILES TO REVIEW

### Backend
- `engage/backend/src/index.ts` - CORS, security
- `engage/backend/src/routes/services.ts` - Services API
- `engage/backend/src/routes/tenants.ts` - Settings API
- `engage/backend/src/middleware/auth.ts` - JWT handling

### Frontend
- `engage/frontend/src/pages/services/Services.tsx` - Services page
- `engage/frontend/src/pages/Settings.tsx` - Settings page
- `engage/frontend/src/pages/proposals/ProposalDetail.tsx` - Cover letter
- `engage/frontend/src/utils/api.ts` - API methods

---

## 🎯 SUCCESS CRITERIA

✅ App loads without errors  
✅ Login works with demo credentials  
✅ All pages accessible  
✅ CRUD operations work (Proposals, Clients, Services)  
✅ Settings save correctly  
✅ No console errors  
✅ Responsive on mobile/desktop  
✅ Deployed to Railway/Neon  

---

## 📞 EMERGENCY CONTACTS

- **Railway Dashboard:** https://railway.app/dashboard
- **Neon Console:** https://console.neon.tech
- **Vercel (if using):** https://vercel.com/dashboard

---

*Created: March 4, 2026*  
*Last Updated: 22:50 UTC*  
*Status: Ready for deployment prep*
