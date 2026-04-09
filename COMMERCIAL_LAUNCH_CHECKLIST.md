# Engage by Capstone — Commercial Launch Checklist

## Pre-Launch Requirements

### Environment Variables (Required)

#### Database & Core
- [ ] `DATABASE_URL` — PostgreSQL connection string
- [ ] `JWT_SECRET` — Min 32 characters, secure random string
- [ ] `JWT_EXPIRES_IN` — e.g., `24h`
- [ ] `JWT_REFRESH_EXPIRES_IN` — e.g., `7d`
- [ ] `FRONTEND_URL` — e.g., `https://engage.capstonesoftware.co.uk`

#### Email (Required for notifications)
- [ ] `EMAIL_PROVIDER` — `smtp`, `gmail`, or `outlook`
- [ ] `EMAIL_FROM_NAME` — e.g., `Capstone Software`
- [ ] `EMAIL_FROM_ADDRESS` — e.g., `noreply@capstonesoftware.co.uk`
- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — If using SMTP

#### Companies House (Required for UK company lookup)
- [ ] `COMPANIES_HOUSE_API_KEY` — Get from https://developer.company-information.service.gov.uk/

#### Payment Processing (Choose one or both)

**Option 1: Adfin (Recommended for UK accountants)**
- [ ] `ADFIN_API_KEY` — Get from https://adfin.io
- [ ] `ADFIN_WEBHOOK_SECRET` — From Adfin dashboard

**Option 2: Stripe (For subscription billing)**
- [ ] `STRIPE_SECRET_KEY` — sk_live_...
- [ ] `STRIPE_PUBLISHABLE_KEY` — pk_live_...
- [ ] `STRIPE_WEBHOOK_SECRET` — whsec_...

#### Optional but Recommended
- [ ] `REDIS_URL` — For caching and session storage
- [ ] `UPLOADS_DIR` — Path for file uploads (signatures, etc.)

### Render Deployment Setup

1. **Create PostgreSQL Database**
   - [ ] Create new PostgreSQL instance on Render
   - [ ] Copy Internal Database URL to environment variables
   - [ ] Run migrations: `npx prisma migrate deploy`

2. **Create Web Service (Backend)**
   - [ ] Connect GitHub repo
   - [ ] Build Command: `npm install && cd backend && npx prisma generate && npm run build`
   - [ ] Start Command: `cd backend && npm start`
   - [ ] Add all environment variables
   - [ ] Set health check path: `/ping`

3. **Create Static Site (Frontend)**
   - [ ] Connect GitHub repo
   - [ ] Build Command: `npm install && cd frontend && npm run build`
   - [ ] Publish Directory: `frontend/dist`
   - [ ] Set environment variable: `VITE_API_URL=https://your-backend-url.onrender.com`

4. **Configure Custom Domain**
   - [ ] Add custom domain in Render dashboard
   - [ ] Update DNS records
   - [ ] Update `FRONTEND_URL` environment variable

### Pre-Launch Testing

#### Core Functionality
- [ ] User registration and login works
- [ ] Client creation and management works
- [ ] Service catalog displays correctly
- [ ] Proposal creation flow works end-to-end
- [ ] Proposal PDF generation works
- [ ] Email sending works (test with real email)
- [ ] Companies House lookup works

#### Payment Processing
- [ ] Adfin payment creation works
- [ ] Payment checkout URL generates correctly
- [ ] Webhook handling works
- [ ] Payment status updates correctly

#### Security
- [ ] CSRF protection active
- [ ] Rate limiting active
- [ ] JWT tokens expire correctly
- [ ] Tenant isolation working (users can't see other tenant data)

### Post-Launch Monitoring

#### Essential Monitoring
- [ ] Set up Render analytics/dashboard
- [ ] Configure error alerting (Sentry recommended)
- [ ] Set up database backup notifications
- [ ] Monitor email delivery rates

#### Business Metrics to Track
- [ ] Number of proposals created
- [ ] Proposal acceptance rate
- [ ] Average proposal value
- [ ] Time from creation to acceptance
- [ ] Payment success rate

## Launch Day Tasks

1. **Final Checks**
   - [ ] Verify all environment variables set in production
   - [ ] Run smoke tests on production URLs
   - [ ] Check email deliverability (not spam)
   - [ ] Verify PDF generation works

2. **Go Live**
   - [ ] Update DNS to point to production
   - [ ] Send launch announcement to team
   - [ ] Monitor error logs closely for first 24 hours

3. **Post-Launch**
   - [ ] Gather initial user feedback
   - [ ] Monitor performance metrics
   - [ ] Address any critical issues immediately

## Support & Maintenance

### Regular Tasks
- **Weekly**: Review error logs, check database backups
- **Monthly**: Review payment processing fees, update dependencies
- **Quarterly**: Security audit, performance review

### Emergency Contacts
- Render Support: https://render.com/help
- Adfin Support: support@adfin.io
- Companies House API: https://forum.aws.chdev.org/

---

## Quick Start for New Tenants

1. Create tenant account
2. Configure email settings (SMTP/Gmail/Outlook)
3. Add service templates (or use defaults)
4. Add first client
5. Create first proposal
6. Configure payment processing (Adfin/Stripe)
7. Send first proposal to client

---

Last updated: 2026-04-08
