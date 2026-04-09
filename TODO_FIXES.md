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
**Issue**: CSRF failures occurred when creating new proposals after token expiry.

**Files Modified**:
- `frontend/src/utils/api.ts`

**Changes**:
- Added automatic CSRF token refresh on CSRF_MISSING/CSRF_INVALID errors
- Failed requests are automatically retried with new token
- Users see "Security token expired" message only if retry fails

---

## ⏳ Pending Tasks

### 5. Database Migration
**Status**: Schema updated, migration needed

**Command to run**:
```bash
cd backend
npx prisma migrate dev --name add_vat_fields_to_proposal_service
```

**Schema Changes**:
- Added `vatRate Float @default(20)` to ProposalService
- Added `vatAmount Float @default(0)` to ProposalService
- Added `grossTotal Float @default(0)` to ProposalService

---

### 6. Test Proposal Creation Flow
**Status**: Pending

**Test Cases**:
- [ ] Create proposal with monthly service - verify correct pricing
- [ ] Create proposal with annual service - verify monthly equivalent shown
- [ ] Change billing frequency during creation - verify price recalculation
- [ ] Set different VAT rates per line - verify "Mixed" shows in totals
- [ ] Create proposal after session idle - verify CSRF auto-retry works
- [ ] Verify proposal total matches sum of line items + VAT

---

### 7. Update Proposal Detail View
**Status**: Pending

**File**: `frontend/src/pages/proposals/ProposalDetail.tsx`

**Changes Needed**:
- Display per-line VAT rate if different from default
- Show billing frequency for each service line
- Display gross total (inc VAT) per line

---

### 8. Update Proposal PDF Generation
**Status**: Pending

**File**: `backend/src/services/pdfGenerator.ts`

**Changes Needed**:
- Include per-line VAT rate in PDF output
- Show billing frequency for each service
- Display line-level VAT amounts

---

### 9. Backend Validation Updates
**Status**: Pending

**File**: `backend/src/routes/proposals.ts`

**Changes Needed**:
- Update `updateProposalSchema` to accept per-line VAT and frequency
- Ensure PUT /proposals/:id handles line-level changes correctly

---

### 10. Test Suite Updates
**Status**: Pending

**Files**:
- Any existing proposal creation tests

**Changes Needed**:
- Update tests to include frequency and vatRate in service payloads
- Verify line-level VAT calculations

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
