# ✅ Pre-Deployment Verification Checklist

Use this checklist before deploying to production.

---

## 🔐 Security Verification

- [ ] **JWT_SECRET** is set and is at least 32 characters
- [ ] **NODE_ENV** is set to `production`
- [ ] **CSP Headers** are enabled (not disabled)
- [ ] **Rate limiting** is configured
- [ ] **Helmet** security middleware is enabled
- [ ] No hardcoded secrets in code
- [ ] Database credentials use environment variables

**Verification:**
```bash
grep -r "JWT_SECRET" backend/src/
grep -r "contentSecurityPolicy: false" backend/src/
```

---

## 🗄️ Database Verification

- [ ] **DATABASE_URL** is set correctly
- [ ] All migrations are applied
- [ ] Database is accessible from app
- [ ] Seed data loaded (if needed)

**Verification:**
```bash
cd backend
npx prisma migrate status
npx prisma db seed
```

---

## 📧 Email Configuration

- [ ] **EMAIL_PROVIDER** is set (smtp/gmail/microsoft365)
- [ ] SMTP credentials are valid OR OAuth is configured
- [ ] Test email can be sent

**Verification:**
1. Go to Settings → Email
2. Configure SMTP or OAuth
3. Send test email

---

## 🧪 Functionality Testing

### Authentication
- [ ] Login works with demo credentials
- [ ] Registration flow works
- [ ] Password change works
- [ ] Session expiry handled correctly

### Clients
- [ ] Create client works
- [ ] Edit client works
- [ ] Companies House search works
- [ ] MTD ITSA eligibility shows correctly

### Proposals
- [ ] Create proposal works
- [ ] View proposal displays cover letter
- [ ] Send proposal works
- [ ] Accept proposal works
- [ ] PDF generation works

### Services
- [ ] Services page loads all services
- [ ] Edit service works
- [ ] Create service works
- [ ] Delete service works

### Settings
- [ ] Profile save works
- [ ] Company settings save works
- [ ] Team member management works
- [ ] VAT settings save
- [ ] Email settings save

---

## 🚀 Deployment Readiness

### Environment Variables
- [ ] `.env.production` created from template
- [ ] All required variables filled in
- [ ] No `.env` files in git (check .gitignore)

**Verification:**
```bash
git status | grep ".env"
```

### Build Verification
- [ ] Backend builds without errors
- [ ] Frontend builds without errors
- [ ] All TypeScript compiles
- [ ] No console errors in browser

**Verification:**
```bash
./build-production.sh
```

### Health Check
- [ ] Backend responds on `/api/health`
- [ ] Database connection successful
- [ ] No errors in logs

**Verification:**
```bash
curl http://localhost:3001/api/health
```

---

## 📊 Performance Checks

- [ ] Page load time < 3 seconds
- [ ] API response time < 500ms
- [ ] No memory leaks in backend
- [ ] Database queries are optimized

---

## 🌐 CORS & Domains

- [ ] CORS configured for production domain
- [ ] FRONTEND_URL set correctly
- [ ] No localhost in production CORS

**Verification:**
Check `backend/src/index.ts` CORS configuration.

---

## 📋 Final Checks

- [ ] README updated with deployment instructions
- [ ] LICENSE file present
- [ ] No sensitive files in repository
- [ ] Git repository is clean (`git status`)
- [ ] All tests passing (if any)

---

## 🎯 Quick Test Script

Run this to verify everything:

```bash
#!/bin/bash
echo "🔍 Running pre-deployment checks..."

# Check environment
test -f .env.production && echo "✅ .env.production exists" || echo "❌ .env.production missing"

# Check build
test -d backend/dist && echo "✅ Backend built" || echo "❌ Backend not built"
test -d frontend/dist && echo "✅ Frontend built" || echo "❌ Frontend not built"

# Check health
curl -s http://localhost:3001/api/health | grep -q "healthy" && echo "✅ Backend healthy" || echo "❌ Backend not healthy"

echo ""
echo "Manual checks needed:"
echo "  - Login functionality"
echo "  - Create proposal"
echo "  - Send email"
echo "  - Settings save"
```

---

## 🚨 Rollback Plan

If deployment fails:

1. **Database:** Have backup before migrations
   ```bash
   pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
   ```

2. **Railway:** Use Railway dashboard to rollback to previous deployment

3. **Environment:** Keep previous environment variables saved

---

## ✅ Sign-off

| Check | Status | Signed By |
|-------|--------|-----------|
| Security | ⬜ | |
| Database | ⬜ | |
| Functionality | ⬜ | |
| Performance | ⬜ | |
| Documentation | ⬜ | |

**Deployment Approved By:** _________________

**Date:** _________________

---

*Last updated: March 5, 2026*
