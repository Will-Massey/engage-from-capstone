# Engage by Capstone - Project Summary

**Last Updated:** 2026-04-09  
**Status:** Ready for Commercial Launch

---

## Overview

Engage by Capstone is a professional proposal-generation platform for UK accountancy practices. It enables firms to create, share, and electronically sign compliant engagement letters and proposals.

---

## Features Implemented

### Core Features ✅

- [x] Multi-tenant architecture with row-level isolation
- [x] Role-based access control (ADMIN, PARTNER, MANAGER, SENIOR, JUNIOR)
- [x] Client management with Companies House lookup
- [x] Service catalog with UK-specific accountancy services
- [x] Proposal creation with 3-step wizard
- [x] PDF generation with professional formatting
- [x] Electronic signatures (stored as PNG files)
- [x] Email notifications (acceptance, renewal reminders)
- [x] Proposal sharing via secure tokens
- [x] Cover letter templates (Professional, Friendly, Modern)

### Payment Integration ✅

- [x] Revolut integration for UK payment collection
- [x] Revolut Checkout popup + webhook fulfilment
- [x] Payment tracking and webhook handling
- [x] Stripe integration (alternative option)

### Pricing & Billing ✅

- [x] Custom unit price editing in proposals
- [x] Monthly/Quarterly/Annual/One-time service frequencies
- [x] Line-item discounts
- [x] VAT calculation (20%)
- [x] Real-time price calculations

### Renewal System ✅

- [x] Automatic renewal date calculation (12 months)
- [x] 30-day reminder emails
- [x] Background job for daily checks
- [x] One-click renewal proposal creation

---

## Recent Changes (Last Session)

### 1. Custom Pricing Fix

**Issue:** Custom unit prices were being reverted to template prices  
**Fix:** Modified proposal creation to use frontend-provided unit prices directly

### 2. Frequency Display

**Issue:** Services weren't clearly showing monthly vs annual pricing  
**Fix:**

- Added frequency badges to service cards
- Added frequency display in Step 3 review
- Added frequency to PDF output

### 3. Tenant Validation

**Issue:** Data was being saved without tenant ID (causing data loss)  
**Fix:** Added strict tenant validation - API now fails if no tenant found

### 4. Revolut Integration

**New Feature:** UK payment processing

- Create Revolut checkout orders
- Handle webhooks with payment splits
- Track payment status

---

## File Structure

```
engage/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── proposals.ts          # Main proposal CRUD
│   │   │   ├── proposals-share.ts    # Public sharing & signatures
│   │   │   ├── clients.ts            # Client management
│   │   │   ├── billing.ts            # Revolut billing + webhooks
│   │   │   └── coverLetterTemplates.ts
│   │   ├── services/
│   │   │   ├── pdfGenerator.ts       # PDF creation
│   │   │   ├── proposalPayment.ts    # Revolut proposal checkout
│   │   │   ├── emailService.ts       # Email notifications
│   │   │   ├── proposalSharingService.ts
│   │   │   └── pricingEngine.ts
│   │   ├── jobs/
│   │   │   └── renewalReminders.ts   # Background job
│   │   ├── templates/
│   │   │   ├── acceptanceNotification.ts
│   │   │   └── renewalReminder.ts
│   │   └── middleware/
│   │       └── tenant-simple.ts      # Tenant extraction
│   └── prisma/
│       └── schema.prisma             # Database schema
├── frontend/
│   └── src/
│       └── pages/
│           └── proposals/
│               ├── CreateProposal.tsx  # 3-step wizard
│               ├── Proposals.tsx       # List view
│               └── ProposalDetail.tsx
└── RESTORE_SCRIPT.sh                  # Run after PC restart
```

---

## Environment Variables Required

### Critical (Must Set)

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=your-super-secret-32-char-min
FRONTEND_URL=https://your-domain.com
```

### For Full Functionality

```bash
# Companies House (UK company lookup)
COMPANIES_HOUSE_API_KEY=your-key

# Email Notifications
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
EMAIL_FROM_NAME=Your Practice
EMAIL_FROM_ADDRESS=noreply@yourpractice.com

# Payments (Revolut for client proposal payments)
REVOLUT_API_SECRET_KEY=your-revolut-secret
REVOLUT_API_PUBLIC_KEY=your-revolut-public-key
REVOLUT_WEBHOOK_SECRET=your-webhook-secret
ENGAGE_PLATFORM_FEE_BPS=250

# OR Stripe (alternative)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Database Schema

### Key Models

- **Tenant** - Multi-tenant isolation
- **User** - Practice staff with roles
- **Client** - Client records
- **Proposal** - Proposals with payment tracking
- **ProposalService** - Line items
- **ServiceTemplate** - Reusable services
- **CoverLetterTemplate** - Customizable templates
- **ProposalSignature** - e-Signatures (PNG files)

---

## Known Issues & Workarounds

### 1. Companies House API

- **Status:** Requires API key
- **Action:** Get key from https://developer.company-information.service.gov.uk/

### 2. Email Configuration

- **Status:** Requires SMTP credentials
- **Action:** Set up Gmail/Outlook SMTP or use email service

### 3. File Storage (Signatures)

- **Status:** Uses local filesystem
- **Action:** For production, configure persistent storage path

---

## Deployment Checklist

### Pre-Launch

- [ ] Set all environment variables in Render
- [ ] Run database migrations
- [ ] Configure custom domain
- [ ] Test email delivery
- [ ] Test PDF generation
- [ ] Test payment flow (if using Revolut/Stripe)

### Launch

- [ ] Deploy backend to Render
- [ ] Deploy frontend to Render/Vercel
- [ ] Update DNS records
- [ ] Test end-to-end proposal flow

### Post-Launch

- [ ] Monitor error logs
- [ ] Check database backups
- [ ] Review payment processing

---

## Quick Commands

```bash
# Development
npm run dev:backend      # Terminal 1
npm run dev:frontend     # Terminal 2

# Build
npm run build            # Build everything

# Database
cd backend
npx prisma migrate deploy
npx prisma generate
npx prisma studio

# Deployment
git add -A
git commit -m "message"
git push origin master
```

---

## Restore After PC Restart

1. Open terminal
2. Navigate to project:
   ```bash
   cd /Users/capstone/Desktop/engage
   ```
3. Run restore script:
   ```bash
   ./RESTORE_SCRIPT.sh
   ```

The script will:

- Check git repository
- Install all dependencies
- Generate Prisma client
- Build frontend
- Check environment variables
- Show current status

---

## Support & Documentation

- **Render Dashboard:** https://dashboard.render.com
- **GitHub Repo:** https://github.com/Will-Massey/engage-from-capstone
- **Revolut Merchant API:** https://developer.revolut.com/docs/merchant
- **Companies House API:** https://developer.company-information.service.gov.uk/

---

## Git Commits (Recent)

```
b92e119b fix: Custom pricing and frequency display
3cd14235 fix: Add strict tenant validation to prevent data loss
0c139c57 chore: Add database migration for payment tracking fields
28f9e6f6 feat: Add Adfin payment integration and commercial launch prep
67f71ca0 fix: Add tenant extraction to Companies House routes
343f5565 debug: Add logging for tenant extraction and proposal operations
0c139c57 chore: Add database migration for payment tracking fields
28f9e6f6 feat: Add Adfin payment integration and commercial launch prep
...
```

---

**Status:** All work saved ✅  
**Ready for restart:** Yes ✅  
**Restore script:** `/Users/capstone/Desktop/engage/RESTORE_SCRIPT.sh` ✅
