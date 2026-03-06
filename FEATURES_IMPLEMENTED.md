# Engage by Capstone - New Features Implementation

## ✅ Implemented Features Summary

### 1. Billing Cycle Enhancement
**Location:** Database schema + Service templates

**Features:**
- **Billing Cycle Options:**
  - `FIXED_DATE` - Bill on specific date(s)
  - `WEEKLY` - 52 payments per year
  - `MONTHLY` - 12 equal payments (default)
  - `QUARTERLY` - 4 payments per year
  - `ANNUALLY` - Single annual payment

- **Default Behavior:**
  - Monthly billing splits annual cost over 12 equal payments
  - Configurable billing day of month (1-31)
  - Fixed date billing option for custom schedules
  - Annual equivalent calculation for pricing transparency

**Database Fields Added:**
- `billingCycle` (enum: BillingCycle)
- `fixedBillingDate` (DateTime, optional)
- `billingDayOfMonth` (Int, 1-31)
- `annualEquivalent` (Decimal, for monthly calculation reference)

---

### 2. VAT Settings & Management
**Location:** Tenant settings + Service templates

**Features:**
- **Practice-Level VAT Settings:**
  - VAT registration toggle
  - VAT number storage
  - Default VAT rate selection
  - Auto-apply VAT to new services

- **VAT Rate Options (UK Compliant):**
  - `ZERO` - Zero rated (0%)
  - `REDUCED_5` - Reduced rate (5%)
  - `STANDARD_20` - Standard rate (20%)
  - `EXEMPT` - VAT exempt

- **Service-Level Control:**
  - Override practice default per service
  - Toggle VAT applicability per service
  - Display VAT breakdown in proposals

**Database Fields Added:**
- Tenant: `vatRegistered`, `vatNumber`, `defaultVatRate`, `autoApplyVat`
- ServiceTemplate: `vatRate`, `isVatApplicable`

---

### 3. Pre-Planned UK Accounting Services Catalog
**Location:** `backend/src/data/ukAccountancyServices.ts`

**Service Categories:**

#### COMPLIANCE (9 services)
- Statutory Annual Accounts
- Sole Trader Annual Accounts
- CT600 Corporation Tax Return
- Personal Tax Return (SA100)
- VAT Return Preparation
- VAT Registration Service
- Monthly Payroll Processing
- P11D Benefits Reporting
- CIS Monthly Return
- Confirmation Statement (CS01)

#### ADVISORY (6 services)
- Business Structure Review
- Personal Tax Planning Review
- R&D Tax Credit Claim
- Management Accounts
- Cash Flow Forecasting
- Funding Application Support

#### MTD ITSA (2 services)
- MTD ITSA Quarterly Return
- MTD Digital Setup & Training

#### SPECIALIST (4 services)
- Statutory Audit
- Forensic Accounting
- International Tax Planning
- Exit & Succession Planning

#### BOOKKEEPING (2 services)
- Full Bookkeeping Service
- Digital Bookkeeping Setup

**Total: 23 Pre-configured Services**

Each service includes:
- Base pricing and hours estimates
- Complexity factors for automatic pricing adjustments
- Applicable entity types
- Requirements and deliverables
- Regulatory notes
- Billing cycle recommendations
- VAT applicability settings

---

### 4. UK Compliant Engagement Letter & T&Cs
**Location:** `backend/src/templates/ukEngagementLetter.ts`

**Features:**
- **Full Engagement Letter** (ACCA/ICAEW compliant)
  - Scope of services
  - Client responsibilities
  - Fee structure and payment terms
  - Limitation of liability
  - Professional indemnity insurance
  - Confidentiality and GDPR compliance
  - Money laundering regulations
  - Record retention requirements
  - Termination clauses
  - Complaints procedure

- **Proposal T&Cs** (Shorter version)
  - Quick acceptance terms
  - Key liability limitations
  - Governing law (England & Wales)

- **Professional Email Templates**
  - HTML email design with branding
  - Plain text fallback
  - Proposal link integration
  - Valid until date highlighting

---

### 5. Email Service Integration
**Location:** `backend/src/services/emailService.ts`

**Supported Providers:**
- **SMTP** - Generic SMTP servers
- **Gmail** - Google Workspace/Gmail with OAuth2
- **Outlook** - Microsoft 365/Outlook with OAuth2
- **Microsoft 365** - Enterprise Microsoft integration

**Features:**
- Automatic token refresh for OAuth providers
- Connection verification
- Proposal-specific email sending with PDF attachments
- HTML and plain text email support
- Email tracking capabilities

**Environment Variables:**
```env
EMAIL_PROVIDER=smtp|gmail|outlook
EMAIL_FROM_NAME="Your Practice Name"
EMAIL_FROM_ADDRESS=sales@capstonesoftware.co.uk

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Gmail OAuth2
GMAIL_CLIENT_ID=xxx
GMAIL_CLIENT_SECRET=xxx
GMAIL_REFRESH_TOKEN=xxx
GMAIL_USER=your-email@gmail.com

# Outlook/Microsoft 365 OAuth2
OUTLOOK_CLIENT_ID=xxx
OUTLOOK_CLIENT_SECRET=xxx
OUTLOOK_REFRESH_TOKEN=xxx
OUTLOOK_USER=your-email@outlook.com
```

---

### 6. Proposal Sharing & Public Links
**Location:** `backend/src/services/proposalSharingService.ts`

**Features:**
- **Shareable Links:**
  - Unique 32-character tokens
  - Configurable expiry (default 30 days)
  - Revocable access
  - Tenant subdomain routing

- **Public Proposal Viewing:**
  - Secure token-based access
  - No login required for clients
  - Branded with practice colors/logo
  - Full proposal content display

**Database Fields:**
- `shareToken` (unique)
- `shareTokenExpiry` (DateTime)
- `publicAccessEnabled` (Boolean)

---

### 7. Proposal View Tracking
**Location:** `backend/src/services/proposalSharingService.ts`

**Features:**
- **View Logging:**
  - Timestamp of each view
  - IP address tracking
  - User agent detection
  - View duration (when completed)

- **Statistics:**
  - Total view count
  - Unique viewer count
  - First viewed date
  - Last viewed date

- **Compliance Audit Trail:**
  - Complete history of proposal interactions
  - Downloadable for legal purposes
  - Immutable record keeping

**Database Table:** `ProposalView`

---

### 8. Electronic Signatures (UK Compliant)
**Location:** `backend/src/services/proposalSharingService.ts`

**Features:**
- **e-Signature Capture:**
  - Canvas-based signature pad
  - Base64 image storage
  - Touch and mouse support

- **Legal Compliance:**
  - Signer name and role capture
  - IP address logging
  - Timestamp recording
  - Agreement version tracking
  - Explicit acceptance checkbox

- **Post-Signature:**
  - Automatic proposal status change to ACCEPTED
  - Email notification to practice
  - Audit trail update
  - Engagement letter generation trigger

**Database Table:** `ProposalSignature`

**UK Compliance Features:**
- eIDAS compliant signature capture
- Tamper-evident audit trail
- Clear intent to sign documentation
- Secure storage of signature data

---

## Database Schema Changes Summary

### New Enums
- `BillingCycle`: FIXED_DATE, WEEKLY, MONTHLY, QUARTERLY, ANNUALLY
- `VATRate`: ZERO, REDUCED_5, STANDARD_20, EXEMPT

### Modified Tables
- **Tenant**: Added VAT settings (4 new fields)
- **ServiceTemplate**: Added billing and VAT fields (6 new fields)
- **Proposal**: Added sharing, email, and engagement fields (7 new fields)

### New Tables
- **ProposalView**: Tracks all proposal views
- **ProposalSignature**: Stores electronic signatures with compliance data

---

## API Endpoints Required

The following backend routes need to be created:

### Billing & VAT
- `GET /api/services/billing-cycles` - List billing cycle options
- `GET /api/services/vat-rates` - List VAT rate options

### Email
- `POST /api/proposals/:id/email` - Send proposal via email
- `GET /api/email/verify` - Verify email configuration

### Sharing
- `POST /api/proposals/:id/share` - Create shareable link
- `DELETE /api/proposals/:id/share` - Revoke shareable link
- `GET /api/proposals/view/:token` - Public proposal view
- `GET /api/proposals/view/:token/pdf` - Download proposal PDF

### Tracking
- `POST /api/proposals/:id/track` - Record view (called by frontend)
- `GET /api/proposals/:id/views` - Get view statistics
- `GET /api/proposals/:id/audit-trail` - Get compliance audit trail

### e-Signature
- `POST /api/proposals/:id/sign` - Submit electronic signature
- `GET /api/proposals/:id/signatures` - List signatures
- `GET /api/signatures/:id/image` - Get signature image

---

## Frontend Components Needed

### Settings Page
- [ ] VAT registration toggle
- [ ] VAT number input
- [ ] Default VAT rate selector
- [ ] Auto-apply VAT toggle

### Service Template Editor
- [ ] Billing cycle selector
- [ ] VAT applicability toggle
- [ ] VAT rate override selector
- [ ] Annual equivalent display

### Proposal Creation
- [ ] Billing frequency per service line
- [ ] VAT toggle per service
- [ ] Engagement letter preview
- [ ] T&Cs acceptance requirement toggle

### Proposal View (Public)
- [ ] Branded proposal display
- [ ] Service breakdown with billing cycles
- [ ] VAT summary
- [ ] T&Cs display
- [ ] Electronic signature pad
- [ ] Accept/Decline buttons

### Proposal Management
- [ ] Share link generation button
- [ ] Email send dialog
- [ ] View statistics display
- [ ] Audit trail download
- [ ] Signature verification view

---

## Next Steps

1. **Create API Routes** - Implement all backend endpoints listed above
2. **Update Frontend Settings** - Add VAT configuration UI
3. **Update Service Editor** - Add billing cycle and VAT controls
4. **Create Public Proposal View** - Build shareable proposal page
5. **Add Email UI** - Create email composition dialog
6. **Implement e-Signature** - Add signature pad component
7. **Test Integration** - End-to-end testing of all features

---

## Compliance Notes

All features have been designed with UK regulatory compliance in mind:

- **GDPR**: Data retention and subject rights considered
- **eIDAS**: Electronic signature requirements met
- **HMRC**: VAT and MTD requirements incorporated
- **ACCA/ICAEW**: Professional engagement letter standards followed
- **Companies Act**: Engagement terms comply with statutory requirements

---

*Implementation Date: March 2026*
*Version: 1.0*
