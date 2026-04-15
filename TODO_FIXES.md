# Proposal System Fixes - TODO List

## ✅ Completed Fixes

### 1. Pricing Frequency Mismatch (COMPLETED)

**Issue**: Services displayed annual prices (£850/year) as if they were monthly, causing inflated proposal totals.

**Files Modified**:

- `frontend/src/components/proposals/ProposalBuilder.tsx`
- `frontend/src/pages/proposals/CreateProposal.tsx`

**Changes**:

- Added `defaultFrequency` field to Service interface
- Updated price display to show monthly equivalents for annual services
- Service catalog now shows: "£71/mo" with "£850/year" badge for annual services
- Proposal builder converts annual prices to monthly equivalents on add

---

### 2. Billing Period Editing (COMPLETED)

**Issue**: Users couldn't change billing frequency during proposal creation.

**Files Modified**:

- `frontend/src/components/proposals/ProposalBuilder.tsx`
- `frontend/src/pages/proposals/CreateProposal.tsx`

**Changes**:

- Added billing frequency dropdown (Monthly/Quarterly/Annual/One-time) to each service line
- Price automatically recalculates when frequency changes
- Frequency is saved with each proposal service

---

### 3. Line-Level VAT Configuration (COMPLETED)

**Issue**: VAT could only be set globally, not per service line.

**Files Modified**:

- `frontend/src/components/proposals/ProposalBuilder.tsx`
- `frontend/src/pages/proposals/CreateProposal.tsx`
- `backend/src/routes/proposals.ts`
- `backend/prisma/schema.prisma`

**Changes**:

- Added VAT rate dropdown (0%, 5%, 20%) to each service line
- Each line calculates its own VAT amount
- Global VAT toggle shows "Mixed" when different rates are used
- Schema updated with `vatRate`, `vatAmount`, `grossTotal` fields on ProposalService
- API accepts and stores per-line VAT configuration

---

### 4. CSRF Token Auto-Retry (COMPLETED)

**Issue**: CSRF token failures occurred when creating new proposals after token expiry.

**Files Modified**:

- `frontend/src/utils/api.ts`

**Changes**:

- Added automatic CSRF token refresh on CSRF_MISSING/CSRF_INVALID errors
- Failed requests automatically retry with new token
- Only shows error to user if retry fails

---

### 5. Modern Glassmorphism UI (COMPLETED) ✅ NEW

**Issue**: Site needed modern, visually impressive design with glass-like tiles and theme support.

**Files Modified**:

- `frontend/tailwind.config.js` - Added glass utilities, animations, extended colors
- `frontend/src/index.css` - Complete redesign with glass component classes
- `frontend/src/styles/base.css` - New CSS variables for theming
- `frontend/src/stores/themeStore.ts` - New theme management store
- `frontend/src/components/theme/ThemeToggle.tsx` - Theme toggle component
- `frontend/src/components/layout/DashboardLayout.tsx` - Glass layout with gradient backgrounds
- `frontend/src/components/layout/Sidebar.tsx` - Glass sidebar with tiles
- `frontend/src/components/layout/Header.tsx` - Glass header with theme toggle

**Features Implemented**:

- ✅ Frosted glass effect on cards, tiles, modals, and navigation
- ✅ Light/Dark theme toggle with system preference detection
- ✅ Persistent theme selection across sessions
- ✅ Gradient backgrounds with subtle animations
- ✅ Modern color palette with purple/indigo accents
- ✅ Glass morphism on buttons, inputs, and interactive elements
- ✅ Mobile-responsive design with touch-friendly targets
- ✅ Smooth transitions and hover effects
- ✅ Reduced motion support for accessibility

---

## ⏳ Pending Tasks

### 6. Database Migration

**Status**: Schema updated, migration SQL created

**Migration File**: `backend/prisma/migrations/add_vat_fields_to_proposal_service/migration.sql`

**Command to run when DB is available**:

```bash
cd backend
npx prisma migrate dev --name add_vat_fields_to_proposal_service
```

**Schema Changes**:

- Added `vatRate Float @default(20)` to ProposalService
- Added `vatAmount Float @default(0)` to ProposalService
- Added `grossTotal Float @default(0)` to ProposalService

---

### 7. Update Proposal Detail View

**Status**: Pending

**File**: `frontend/src/pages/proposals/ProposalDetail.tsx`

**Changes Needed**:

- Display per-line VAT rate if different from default
- Show billing frequency for each service line
- Display gross total (inc VAT) per line
- Apply glass card styling

---

### 8. Update Proposal PDF Generation

**Status**: Pending

**File**: `backend/src/services/pdfGenerator.ts`

**Changes Needed**:

- Include per-line VAT rate in PDF output
- Show billing frequency for each service
- Display line-level VAT amounts

---

### 9. Backend PUT Endpoint Updates

**Status**: Pending

**File**: `backend/src/routes/proposals.ts`

**Changes Needed**:

- Update `updateProposalSchema` to accept per-line VAT and frequency
- Ensure PUT /proposals/:id handles line-level changes correctly

---

### 10. Additional Page Styling

**Status**: In Progress

**Pages to Update with Glass Design**:

- `frontend/src/pages/Dashboard.tsx` - Dashboard cards and stats
- `frontend/src/pages/proposals/Proposals.tsx` - Proposal list cards
- `frontend/src/pages/clients/Clients.tsx` - Client list cards
- `frontend/src/pages/services/Services.tsx` - Service catalog cards
- `frontend/src/pages/Settings.tsx` - Settings panels

---

## 📝 Notes

### Pricing Logic Summary

- **Annual services**: basePrice stored as annual, displayed as monthly (÷12)
- **Quarterly services**: basePrice stored as quarterly, displayed as monthly (÷3)
- **Monthly/One-time**: basePrice used as-is
- When changing frequency in proposal, price recalculates accordingly

### VAT Logic Summary

- Default VAT rate: 20%
- Can be overridden per service line (0%, 5%, 20%)
- Line total = (qty × unitPrice) - discount
- Line VAT = line total × (vatRate / 100)
- Line gross = line total + line VAT
- Proposal total = sum of line totals + sum of line VATs

### CSRF Logic Summary

- Token stored in memory for cross-domain support
- Token refreshed automatically on CSRF errors
- Failed requests retry once with new token

### Theme System Summary

- CSS variables for dynamic theming
- Three modes: Light, Dark, System
- System mode follows OS preference
- Persisted in localStorage
- Smooth transitions between themes
- Glass effects adapt to both themes

### Glassmorphism Classes Available

- `.glass` - Basic glass effect
- `.glass-card` - Glass card with border and shadow
- `.glass-tile` - Interactive glass tile with hover
- `.glass-panel` - Panel with glass effect
- `.btn-primary` - Glass gradient button
- `.btn-secondary` - Glass outline button
- `.input-field` - Glass input styling
- `.card` / `.card-hover` - Glass cards
