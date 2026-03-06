# Engage by Capstone - Production Deployment Guide
**Date:** 06 March 2026

---

## Phase 1: Neon PostgreSQL Database Setup

### Step 1: Create Neon Account
1. Go to https://neon.tech
2. Sign up with GitHub or email
3. Create a new project called "engage-production"
4. Select region: **Europe (Frankfurt)** - closest to UK

### Step 2: Get Connection String
1. In Neon Dashboard, click "Connection Details"
2. Copy the **Prisma** connection string (looks like):
   ```
   postgresql://username:password@ep-xxx.eu-central-1.aws.neon.tech/engage?sslmode=require
   ```

### Step 3: Save for Later
- You'll need this for Railway environment variables

---

## Phase 2: Railway Backend Deployment

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

### Step 2: Login to Railway
```bash
railway login
```

### Step 3: Create Project
```bash
cd engage/backend
railway init --name engage-backend
```

### Step 4: Add PostgreSQL Plugin (OR use Neon)
**Option A: Railway PostgreSQL (Easier)**
```bash
railway add --plugin postgresql
```

**Option B: Neon (Recommended for production)**
- Skip this, we'll use Neon connection string

### Step 5: Configure Environment Variables
Add these variables in Railway Dashboard or CLI:

```bash
# Database (from Neon or Railway)
DATABASE_URL="your-neon-connection-string"

# JWT
JWT_SECRET="your-super-secret-jwt-key-minimum-32-characters-long"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_EXPIRES_IN="7d"

# Application
NODE_ENV="production"
API_URL="https://engage-backend-production.up.railway.app"
FRONTEND_URL="https://engagebycapstone.co.uk"

# Email (Capstone SMTP)
EMAIL_PROVIDER=smtp
SMTP_HOST="smtp.123-reg.co.uk"
SMTP_PORT=587
SMTP_USER="william@capstonesoftware.co.uk"
SMTP_PASS="Liberty2024!"
EMAIL_FROM_NAME="Engage by Capstone"
EMAIL_FROM_ADDRESS="sales@capstonesoftware.co.uk"

# Microsoft OAuth (REQUIRED)
MICROSOFT_CLIENT_ID="33ad7f5f-6b5f-4635-9e3c-d47968d9c874"
MICROSOFT_CLIENT_SECRET="your-secret-from-azure"
MICROSOFT_TENANT_ID="6534c139-7a2b-4df3-bb4b-0014f58cde83"

# Stripe Live
STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Companies House
COMPANIES_HOUSE_API_KEY="your-key"

# Encryption (for OAuth credentials in DB)
ENCRYPTION_KEY="same-as-jwt-secret-or-generate-new-32-char"
```

### Step 6: Deploy
```bash
railway up
```

### Step 7: Run Migrations
```bash
railway run npx prisma migrate deploy
```

---

## Phase 3: Vercel Frontend Deployment

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Login
```bash
vercel login
```

### Step 3: Deploy
```bash
cd engage/frontend
vercel --prod
```

### Step 4: Configure Environment Variables
In Vercel Dashboard, add:

```bash
VITE_API_URL="https://engage-backend-production.up.railway.app"
VITE_STRIPE_PUBLIC_KEY="pk_live_..."
```

---

## Phase 4: Domain Configuration

### Step 1: DNS Records
Add these records to your domain registrar:

```
# Root domain
A     @     76.76.21.21          (Vercel)

# WWW
CNAME www   cname.vercel-dns.com

# API subdomain (if using Railway)
CNAME api   your-railway-domain.up.railway.app
```

### Step 2: SSL Certificates
- Vercel: Automatic SSL
- Railway: Automatic SSL

### Step 3: Update CORS
Update `backend/src/index.ts` allowed origins:

```typescript
const allowedOrigins = [
  'https://engagebycapstone.co.uk',
  'https://www.engagebycapstone.co.uk',
  // ... other origins
];
```

---

## Phase 5: Post-Deployment Checklist

### Database
- [ ] Migrations ran successfully
- [ ] Seed data created (services, default templates)
- [ ] Connection pooling configured (if needed)

### Backend
- [ ] Health check endpoint responds: `/health`
- [ ] API responds: `/api/status`
- [ ] Database connected
- [ ] Email sending works
- [ ] Stripe webhooks configured

### Frontend
- [ ] Loads without errors
- [ ] Login works
- [ ] API calls succeed (check Network tab)
- [ ] Stripe payment form loads

### Security
- [ ] HTTPS enforced (HSTS headers)
- [ ] JWT tokens working
- [ ] CSRF protection active
- [ ] Rate limiting active

### Monitoring
- [ ] Railway dashboard showing metrics
- [ ] Vercel analytics enabled
- [ ] Error tracking (Sentry) configured

---

## Rollback Plan

### Railway
```bash
railway rollback
```

### Vercel
```bash
vercel --rollback
```

### Database
- Neon has automatic backups
- Can restore to any point in time

---

## Troubleshooting

### Database Connection Issues
1. Check DATABASE_URL format
2. Ensure SSL mode is enabled
3. Verify IP allowlist (Neon settings)

### CORS Errors
1. Update allowedOrigins in backend
2. Verify FRONTEND_URL matches actual domain

### Build Failures
1. Check TypeScript errors: `npx tsc --noEmit`
2. Verify all env vars are set
3. Check build logs in Railway/Vercel dashboard

---

*Deployment guide created: 06 March 2026*
