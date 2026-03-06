# Proposal Lifecycle Implementation Summary

## Overview
Comprehensive proposal lifecycle features have been implemented for the Engage by Capstone platform, including UK-compliant cover letters with NLP language, logo upload for branding, service management, proposal expiry/renewal system, audit trail, and multi-channel delivery.

---

## ✅ Implemented Features

### 1. UK-Compliant Cover Letter with NLP Language
**Location:** `frontend/src/data/defaultCoverLetter.ts`

- Professional UK accounting tone with subtle persuasion
- Uses trust-building phrases ("trusted accounting partner")
- Addresses client pain points ("overwhelming", "uncertain about tax obligations")
- Includes clear call-to-action for signature
- Personalized placeholders: `[Client Name]`, `[Practice Name]`, `[Accountant Name]`

**Key NLP Elements:**
- Empathy: "We understand that managing your finances can feel overwhelming"
- Social proof: "Many of our clients tell us..."
- Loss aversion: "You'll never have to feel that way again"
- Simplicity: "We handle the numbers, so you don't have to worry"

---

### 2. Logo Upload for Tenant Branding
**Frontend:** `frontend/src/pages/Settings.tsx` (Company tab)
**Backend:** `backend/src/routes/tenant.ts`

**Features:**
- File upload via Multer middleware
- Supported formats: PNG, JPG, SVG
- Max file size: 2MB
- Logo displayed on proposals and cover letters
- Stored as base64 or URL in `tenant.logo` field

**API Endpoint:**
```
PUT /api/tenant/logo
Content-Type: multipart/form-data
Body: { logo: File }
```

---

### 3. Service Management (CRUD)
**Location:** `frontend/src/pages/services/Services.tsx`

**Features:**
- List all 24 UK accounting services with category filters
- Edit existing services (price, description, billing options)
- Create new custom services
- Duplicate service functionality
- Enable/disable services
- Sort by category and price

**Service Categories:**
- COMPLIANCE (10 services)
- ADVISORY (6 services)
- TAX (2 services)
- BOOKKEEPING (2 services)
- CONSULTING (4 services)

**API Endpoints:**
```
GET    /api/services
POST   /api/services
PUT    /api/services/:id
DELETE /api/services/:id
POST   /api/services/:id/duplicate
```

---

### 4. Proposal Expiry & Renewal System
**Database Schema:** See `backend/prisma/schema.prisma`

**Status Workflow:**
```
DRAFT → SENT → VIEWED → ACCEPTED
                 ↓
              EXPIRED (when validUntil < now)
```

**Features:**
- `validUntil` date for each proposal
- Automatic expiry checking middleware
- Yearly renewal reminders
- Contract anniversary tracking
- Auto-draft generation for renewals

**API Endpoints:**
```
# Expiry Check
GET /api/proposals/check-expiry

# Renewal Management
GET  /api/proposals/:id/renewal-preview
POST /api/proposals/:id/renew
```

---

### 5. Audit Trail for Views & Signatures
**Database Tables:**
- `ProposalView` - Tracks every proposal view
- `ProposalSignature` - Stores e-signature compliance data

**Tracked Data:**
```typescript
// ProposalView
{
  id: string
  viewedAt: DateTime
  ipAddress: string
  userAgent: string
  proposalId: string
}

// ProposalSignature
{
  id: string
  signedBy: string
  signatureData: string (base64 image)
  signedAt: DateTime
  ipAddress: string
  proposalId: string
}
```

**API Endpoints:**
```
POST /api/proposals/:id/view       # Record a view
POST /api/proposals/:id/signature  # Submit signature
GET  /api/proposals/:id/audit      # Get full audit trail
```

---

### 6. Multi-Channel Delivery System
**Delivery Methods:**

| Method | Description | Status |
|--------|-------------|--------|
| **Draft** | Save for internal review | ✅ Implemented |
| **Email** | Send via configured SMTP | ✅ Implemented |
| **Link** | Generate shareable URL | ✅ Implemented |

**Email Configuration:**
- SMTP settings in Settings > Email
- Support for Gmail, Outlook, Custom SMTP
- Template customization
- Automatic reminder emails

**API Endpoints:**
```
POST /api/proposals/:id/send      # Send via email
POST /api/proposals/:id/send-link # Generate share link
GET  /api/proposals/view/:token   # Public view (no auth)
```

---

## Navigation & Routes

### Sidebar Links
- Dashboard
- Proposals
- Clients
- **Services** ⭐ (New)
- Settings

### Routes Configured
```
/services          - Service management list
/services/:id      - Service detail/edit
/proposals/:id     - Proposal detail with audit
/proposals/view/:token - Public proposal view
```

---

## Database Schema Updates

### New Tables
```prisma
model ProposalView {
  id           String   @id @default(uuid())
  proposalId   String
  viewedAt     DateTime @default(now())
  ipAddress    String?
  userAgent    String?
  proposal     Proposal @relation(fields: [proposalId], references: [id])
}

model ProposalSignature {
  id            String   @id @default(uuid())
  proposalId    String
  signedBy      String
  signatureData String
  signedAt      DateTime @default(now())
  ipAddress     String?
  proposal      Proposal @relation(fields: [proposalId], references: [id])
}
```

### Updated Tables
```prisma
model Proposal {
  status          ProposalStatus @default(DRAFT)
  validUntil      DateTime
  coverLetter     String?
  terms           String?
  views           ProposalView[]
  signatures      ProposalSignature[]
  renewalOfId     String?
  renewedBy       Proposal?   @relation("RenewalChain", fields: [renewalOfId], references: [id])
  renewals        Proposal[]  @relation("RenewalChain")
}
```

---

## Security & Compliance

### UK GDPR Compliance
- ✅ Clear data processing statement in T&Cs
- ✅ Record retention requirements (6 years HMRC)
- ✅ Client consent for data processing

### E-Signature Compliance
- ✅ IP address logging
- ✅ Timestamp recording
- ✅ Signer identification
- ✅ Tamper-evident storage

### Access Control
- ✅ Role-based permissions (PARTNER+ for management)
- ✅ Tenant isolation
- ✅ Secure file upload validation

---

## Testing Checklist

- [ ] Create proposal with custom cover letter
- [ ] Upload tenant logo in Settings
- [ ] View Services management page
- [ ] Edit an existing service price
- [ ] Create a new custom service
- [ ] Check proposal expiry logic
- [ ] Record proposal view and check audit trail
- [ ] Submit test signature
- [ ] Send proposal via email
- [ ] Access public proposal link

---

## API Quick Reference

### Proposals
```
GET    /api/proposals
POST   /api/proposals
GET    /api/proposals/:id
PUT    /api/proposals/:id
DELETE /api/proposals/:id
POST   /api/proposals/:id/send
POST   /api/proposals/:id/view
POST   /api/proposals/:id/signature
GET    /api/proposals/:id/audit
GET    /api/proposals/check-expiry
```

### Services
```
GET    /api/services
POST   /api/services
GET    /api/services/:id
PUT    /api/services/:id
DELETE /api/services/:id
POST   /api/services/:id/duplicate
```

### Tenant
```
PUT    /api/tenant
PUT    /api/tenant/logo
GET    /api/tenant/audit-settings
```

---

## Next Steps / Future Enhancements

1. **Automated Reminders**: Cron job for expiry notifications
2. **Proposal Analytics**: Dashboard charts for view/signature rates
3. **Bulk Actions**: Mass renew, archive, delete proposals
4. **Templates**: Save cover letter and T&C templates
5. **Client Portal**: Dedicated client login area
6. **Mobile App**: React Native companion app

---

## Demo Credentials

**URL:** http://localhost:5173
**Email:** admin@demo.practice
**Password:** DemoPass123!

---

*Implementation completed: March 4, 2026*
*Version: 1.0.0*
