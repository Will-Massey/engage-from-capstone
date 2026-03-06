# Engage by Capstone - Restart Point
**Date:** March 6, 2026 (End of Day)  
**Status:** Backend Deployed & Type-Safe  
**Next Session:** Tomorrow

---

## 🎉 CURRENT STATUS (What's Done)

### ✅ Deployment - LIVE
- **Railway URL:** https://capstone-saas-production.up.railway.app
- **Health Check:** ✅ Passing
- **Status:** Active (15 deployments, finally stable)
- **GitHub:** https://github.com/Will-Massey/engage-from-capstone

### ✅ TypeScript - ZERO ERRORS
All 34 TypeScript compilation errors have been resolved:
- Stripe API types fixed
- Email service config types fixed
- Proposal routes type-safe
- Services routes type-safe
- Database queries properly typed

### ✅ Configuration Fixed
- Docker HEALTHCHECK syntax corrected
- OpenSSL installed for Prisma compatibility
- cookie-parser dependency added
- Cross-platform build scripts
- Stripe made optional (app starts without it)

### ✅ GitHub Push Protection Resolved
- Secrets removed from git history using filter-branch
- Successfully pushed to GitHub

---

## 📋 TOMORROW'S TODO LIST

### 🔴 P0 - CRITICAL (First Thing Tomorrow)

#### 1. Configure Production Environment Variables
**Location:** Railway Dashboard → Variables

| Variable | Value to Set | Status |
|----------|-------------|--------|
| `FRONTEND_URL` | `https://engage.capstonesoftware.co.uk` | ⬜ PENDING |
| `ENCRYPTION_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | ⬜ PENDING |
| `COMPANIES_HOUSE_API_KEY` | Get from: https://developer.companieshouse.gov.uk | ⬜ OPTIONAL |
| `STRIPE_SECRET_KEY` | Only if using payments | ⬜ OPTIONAL |

#### 2. Test Custom Domain SSL
**Steps:**
1. Go to Railway Dashboard
2. Navigate to: Settings → Networking
3. Verify: `engage.capstonesoftware.co.uk` shows "Valid" with green check
4. If not valid, check DNS in 123-reg:
   - CNAME: `engage` → `7o7tgluu.up.railway.app`

#### 3. Test API Endpoints
```bash
# Health check
curl https://capstone-saas-production.up.railway.app/ping

# Database health
curl https://capstone-saas-production.up.railway.app/api/health

# Should return JSON responses
```

---

### 🟠 P1 - HIGH (Tomorrow Morning)

#### 4. Database Migration & Seeding
**Command to run in Railway (or locally with DATABASE_URL):**
```bash
# Push schema to database
npx prisma migrate deploy

# Seed with UK accountancy services
npx prisma db seed

# Or run the seed script directly
node backend/dist/scripts/seedServices.js
```

**Verify:** Check PostgreSQL has tables and data

#### 5. Create First Admin User
**Options:**
- Use existing create-superadmin script
- Or create via API directly
- Or use Prisma Studio: `npx prisma studio`

#### 6. Implement PDF Generation
**Location:** `backend/src/routes/proposals-share.ts` lines 201, 571

**TODO:**
- Install puppeteer or pdf-lib
- Implement `generateProposalPdf()` function
- Test PDF attachment in proposal emails

**Code to fix:**
```typescript
// Line 201: Replace TODO with actual PDF generation
if (includePdf) {
  pdfAttachment = await generateProposalPdf(proposal);
}
```

---

### 🟡 P2 - MEDIUM (Tomorrow Afternoon)

#### 7. Configure Email Service
**Options:**

**A) SMTP (Easiest):**
```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**B) Gmail OAuth:**
- Set up Google Cloud project
- Configure OAuth consent screen
- Get CLIENT_ID and CLIENT_SECRET

**C) Outlook/Microsoft 365:**
- Register app in Azure AD
- Get client credentials

**Test:** Send test proposal email

#### 8. Frontend Deployment
**Options:**

**A) Deploy separately to Vercel/Netlify:**
- Build frontend: `npm run build:frontend`
- Set API URL to Railway backend
- Configure CORS in backend

**B) Serve from backend:**
- Build frontend and copy to backend/public
- Serve static files from Express

**C) Railway static site:**
- Create separate Railway service for frontend

#### 9. End-to-End Testing
**Test Flow:**
1. Register tenant
2. Create admin user
3. Log in
4. Create client
5. Create service
6. Create proposal
7. Send proposal (email with PDF)
8. View proposal via public link
9. Accept/decline proposal

---

### 🟢 P3 - LOW (This Week)

#### 10. Security Hardening
- Remove console.log statements
- Implement stricter CORS
- Add rate limiting per endpoint
- Set up Sentry for error monitoring

#### 11. Companies House Integration
- Get API key from Companies House
- Test company lookup endpoint
- Auto-fill client details from company number

#### 12. Stripe Integration (Optional)
- Add STRIPE_SECRET_KEY to Railway
- Configure webhook endpoint
- Test subscription creation

---

## 🔧 QUICK REFERENCE

### Railway Dashboard
- URL: https://railway.app/project/[your-project-id]
- Service: engage-by-capstone
- Region: us-west2

### Useful Commands
```bash
# Check deployment status
curl https://capstone-saas-production.up.railway.app/ping

# View Railway logs (in dashboard)
# Or use Railway CLI: railway logs

# Local development
npm run dev:backend    # Port 3001
npm run dev:frontend   # Port 5173

# Build
npm run build

# Database
npx prisma migrate dev    # Create migration
npx prisma migrate deploy # Apply to prod
npx prisma studio         # GUI for database
npx prisma db seed        # Run seeds
```

### Git Commands
```bash
# Status
git status

# Commit changes
git add -A
git commit -m "feat: description"
git push origin master

# If push blocked by secrets
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch filename" \
  --prune-empty -- HEAD
git push origin master --force
```

### Environment Variables Reference
```env
# Required
DATABASE_URL=postgresql://...
JWT_SECRET=your-256-bit-secret
PORT=3001
NODE_ENV=production

# Frontend
FRONTEND_URL=https://engage.capstonesoftware.co.uk

# Security
ENCRYPTION_KEY=64-char-hex

# Email (choose one provider)
EMAIL_PROVIDER=smtp|gmail|outlook
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# OAuth (if using Gmail/Outlook)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Optional
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
COMPANIES_HOUSE_API_KEY=
```

---

## 🚨 KNOWN ISSUES

### Minor TypeScript Warnings
- Some `as any` type assertions (functional but not ideal)
- Could be refactored to proper types later

### Missing Features
- PDF generation not implemented (marked as TODO)
- Email service requires configuration
- Frontend not deployed
- No automated tests

### Security Notes
- Console.log statements present (information leak risk)
- CORS allows localhost in production (should be stricter)

---

## 📞 SUPPORT RESOURCES

### Documentation
- **Prisma:** https://www.prisma.io/docs
- **Railway:** https://docs.railway.app
- **Stripe:** https://stripe.com/docs
- **Companies House API:** https://developer.companieshouse.gov.uk

### External Services to Set Up
1. **Domain:** 123-reg (already configured CNAME)
2. **Email:** Gmail SMTP or SendGrid
3. **Payments:** Stripe (optional)
4. **Monitoring:** Sentry (optional)

---

## ✍️ NOTES FOR TOMORROW

**Priority 1:** Set `FRONTEND_URL` and `ENCRYPTION_KEY` in Railway  
**Priority 2:** Run database migrations  
**Priority 3:** Test custom domain SSL  
**Priority 4:** Create first admin user  

**Estimated Time:** 2-3 hours for P0+P1 items

---

## 🎯 SUCCESS CRITERIA FOR TOMORROW

- [ ] Backend API responding on custom domain
- [ ] Database migrated and seeded
- [ ] Can create admin user
- [ ] Can log in and get JWT token
- [ ] Frontend decision made (deployment strategy)

---

**Last Updated:** March 6, 2026  
**Updated By:** AI Assistant
