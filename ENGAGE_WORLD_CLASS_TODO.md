# Engage — World-Class Roadmap & TODO

> **Goal:** Make Engage the definitive UK accountancy proposal platform — fast to build, impossible to mis-price, legally defensible to sign, and delightful for practices and their clients.
>
> **Last updated:** 2026-06-11

---

## E-Signature & Authenticity — Current State

Engage already has a foundation for electronic signatures. This section documents what exists and what must be built to meet world-class / UK compliance expectations.

### ✅ Already implemented

| Capability | Location |
|------------|----------|
| Canvas signature pad (mouse + touch) | `frontend/src/components/signature/SignaturePad.tsx` |
| Public signing flow | `frontend/src/pages/public/ProposalView.tsx` |
| Signer name + role capture | `ProposalView.tsx` → `signedBy`, `signedByRole` |
| Device fingerprint (client-side) | platform, screen, timezone, language, cores, touch |
| Server-side IP + User-Agent | `proposals-share.ts` → `recordElectronicSignature` |
| Persistent signature record | `ProposalSignature` model in Prisma |
| PNG file storage + base64 fallback | `proposalSharingService.ts` → `saveSignaturePng` |
| Proposal status → ACCEPTED on sign | Updates `signature`, `acceptedBy`, `acceptedByIp`, `signatoryPosition` |
| Acceptance email to practice | `emailService.sendAcceptanceNotification` with signed PDF |
| View tracking (opens, IP, duration) | `ProposalView` model + public view endpoint |

### ❌ Gaps for world-class authenticity

| Gap | Risk | Priority |
|-----|------|----------|
| `geoLocation` always `null` | Weak location proof | P1 |
| No signer **email** captured or verified | Identity not tied to a contact | P1 |
| No **document hash** at signing time | Cannot prove proposal wasn't altered post-sign | P1 |
| No **signature certificate / audit PDF** | Hard to defend in dispute | P1 |
| Staff in-app accept bypasses forensic flow | Inconsistent evidence | P1 |
| `agreementVersion` hardcoded (`PRO-2024-001`) | Terms drift not tracked | P2 |
| Forensic data not shown to practice in UI | Staff can't verify authenticity | P1 |
| PDF does not embed signature image + audit block | Incomplete signed artefact | P1 |
| No explicit **consent statement** with timestamp | Weaker e-sign validity | P2 |
| No signature **type** label (simple electronic) | UK transparency gap | P2 |
| No tamper-evident **audit log export** | Compliance / ICO requests | P2 |
| Signatures stored on local filesystem | Lost on Render redeploy | P1 |

---

## Phase 1 — Core Reliability (P0)

*Fix what's broken before adding polish. Users must trust numbers and saves.*

### 1.1 Pricing engine unification
- [ ] Fix `loadServices` ONE_TIME → MONTHLY bug in `ProposalBuilder.tsx`
- [ ] Fix POST `lineTotal` to use `netTotal` (discount applied) in `proposals.ts`
- [ ] Wire `pricingEngine_v2.ts` as single backend source of truth; remove v1 from PUT
- [ ] Mirror v2 logic in shared package; import in frontend for live preview parity
- [ ] Add Jest tests for all billing cycles + discount + VAT combinations
- [ ] Add Vitest tests for `ProposalBuilder` summary bands

### 1.2 Proposal save & edit
- [ ] Implement `/proposals/:id/edit` route (or remove dead link in `Proposals.tsx`)
- [ ] Full line-item edit on existing proposals (services, pricing, VAT, frequency)
- [ ] PUT schema accepts all v2 line fields; validate with Zod
- [ ] Surface validation errors from API in builder toast (not just generic message)
- [ ] E2E: create → save → reload → totals match

### 1.3 Totals & display clarity
- [ ] Format all currency to 2dp via `formatCurrency` everywhere
- [ ] Split "Total investment" into labelled bands (Monthly / Quarterly / Annual / One-off)
- [ ] Show **annual equivalent** as secondary figure where helpful
- [ ] ProposalDetail: per-line billing frequency, VAT rate, gross inc VAT

---

## Phase 2 — Proposal Builder Excellence (P1)

*Make building a proposal feel as fast as sending an email.*

### 2.1 Builder UX
- [ ] Keyboard-first service search (type to filter catalog)
- [ ] Drag-to-reorder selected services
- [ ] Inline edit without modal where possible
- [ ] Live sidebar summary always visible (sticky on desktop)
- [ ] Duplicate proposal from existing
- [ ] Proposal templates (pre-filled services + cover letter)
- [ ] Auto-save draft every 30s
- [ ] Unsaved changes warning on navigate away

### 2.2 Cover letter & terms
- [ ] Rich cover letter editor (variables: `{clientName}`, `{directorFirstName}`, `{practiceName}`, `{validUntil}`)
- [ ] Per-tenant default cover letters (already seeded — expose in Settings)
- [ ] UK engagement letter blocks (AML, professional indemnity, complaints, GDPR)
- [ ] Terms version tracking linked to `agreementVersion` on sign

### 2.3 Service catalog
- [ ] ServiceDetail page (currently placeholder)
- [ ] Bulk import services from CSV
- [ ] Service categories with icons
- [ ] Realistic UK accountancy seed data maintained in one script

---

## Phase 3 — E-Signature & Legal Authenticity (P1) ⭐

*Recipient signature with identifying data to prove authenticity — your explicit requirement.*

### 3.1 Signer identity capture
- [ ] Require signer **email** on public sign form (pre-fill from `client.contactEmail`, editable with reason if different)
- [ ] Optional: email OTP verification before signature is accepted
- [ ] Capture signer **legal name** vs display name (Companies House director name match hint)
- [ ] Record `signerEmail` on `ProposalSignature` model (migration)
- [ ] Checkbox: "I confirm I am authorised to sign on behalf of {client.name}"

### 3.2 Forensic evidence (expand)
- [ ] IP geolocation enrichment (city, country — MaxMind or ip-api; store on `geoLocation`)
- [ ] Server timestamp (UTC) + client clock offset if detectable
- [ ] `documentHash` — SHA-256 of proposal content JSON at moment of signing
- [ ] `termsHash` — SHA-256 of terms text shown to signer
- [ ] Store full `consentText` snapshot ("I agree to the terms dated…")
- [ ] Persist `agreementVersion` from actual proposal terms version, not hardcoded
- [ ] Add `signatureType: SIMPLE_ELECTRONIC` enum for UK transparency

### 3.3 Signature certificate & audit artefact
- [ ] Generate **Signature Certificate PDF** page appended to signed proposal:
  - Signer name, role, email
  - Signed at (UTC + Europe/London)
  - IP address, approximate location
  - Device summary (user-agent parsed)
  - Document hash, terms hash
  - Agreement version ID
  - Unique signature record ID
- [ ] Embed signature image on final PDF
- [ ] Practice dashboard: **"Signature audit"** panel on ProposalDetail
  - View all forensic fields (read-only)
  - Download certificate PDF
  - Download raw audit JSON (for legal hold)

### 3.4 Storage & integrity
- [ ] Move signature PNGs to durable storage (S3 / Render disk / Cloudflare R2) — not ephemeral container FS
- [ ] Immutable audit log entry on sign (`ActivityLog` type `PROPOSAL_SIGNED` with full payload hash)
- [ ] Prevent re-signing after ACCEPTED (already enforced — add idempotency key)
- [ ] Staff in-app sign must use same `recordElectronicSignature` path (not lightweight `acceptProposal`)

### 3.5 Client signing UX
- [ ] Mobile-optimised signature pad (full-width, larger touch targets)
- [ ] Clear step flow: Review → Terms → Identity → Sign → Confirmation
- [ ] Post-sign success page with reference number + "copy for your records" PDF download
- [ ] Decline option with reason (status → DECLINED, notify practice)

### 3.6 UK compliance notes (implementation targets)
- [ ] Label as "Simple electronic signature" per UK eIDAS / Electronic Communications Act 2000
- [ ] GDPR: retention policy for IP/device data documented in privacy notice
- [ ] ICO-ready data export includes signature audit for subject access requests
- [ ] Optional future: Advanced electronic signature via qualified provider (DocuSign/Adobe) — out of scope v1

---

## Phase 4 — Send, Track & Client Journey (P1)

### 4.1 Distribution
- [ ] Copy client link (fixed — verify across browsers) ✅ mostly done
- [ ] Send via practice email (SMTP/OAuth) with branded template
- [ ] Send via link only (no email) — manual paste workflow
- [ ] Expiring share links (`shareTokenExpiry` enforced on view)
- [ ] Password-protect sensitive proposals (optional PIN)

### 4.2 Status & tracking
- [ ] Status pipeline visible: Draft → Sent → Viewed → Signed / Declined / Expired
- [ ] Open count + last opened timestamp on ProposalDetail ✅ mostly done
- [ ] Email open tracking (pixel or link) — optional
- [ ] Reminder emails: unopened (3 days), unsigned (7 days), expiring (30 days before `validUntil`)
- [ ] Activity timeline on ProposalDetail (all events chronologically)

### 4.3 Client portal
- [ ] Client portal polish (`/portal/:token`) — match main app theme
- [ ] List all proposals for client with status badges
- [ ] Download signed PDF from portal

---

## Phase 5 — Practice Admin & Insights (P2)

- [ ] Dashboard: real metrics (not mock data) — proposals sent, signed, pipeline value
- [ ] Conversion funnel: sent → viewed → signed rate
- [ ] Revenue forecast from accepted proposals (by billing band)
- [ ] Team activity (who created/sent what)
- [ ] Renewal reminders job verified in production
- [ ] Stripe subscription status in Settings
- [ ] Multi-user roles enforced on sensitive actions

---

## Phase 6 — Security, Compliance & Ops (P1)

- [ ] Env-only secrets (no hardcoded keys) ✅ done
- [ ] CORS safe-by-default ✅ done
- [ ] CSRF on all mutating routes ✅ done
- [ ] Rate limit public sign endpoint (prevent abuse)
- [ ] Audit log for admin actions
- [ ] `npm run verify` in CI on every PR ✅ configured
- [ ] Playwright E2E for full sign flow with forensic assertions
- [ ] Database backups documented + tested restore
- [ ] Render deploy: migrations must fail loudly (not swallowed in `start-prod.mjs`)

---

## Phase 7 — Performance & Polish (P2)

- [ ] Glass UI on Dashboard, Clients, Proposals list (partially done)
- [ ] Skeleton loaders on all data pages
- [ ] Command palette wired to all routes
- [ ] Onboarding tour for first login
- [ ] Accessibility audit (WCAG 2.1 AA on sign flow)
- [ ] PWA / mobile responsive audit
- [ ] PDF generation < 3s for typical proposal

---

## Phase 8 — Integrations (P3)

- [ ] Companies House lookup in client create
- [ ] Xero / QuickBooks client sync
- [x] Revolut payment on acceptance (Revolut checkout + webhook)
- [ ] HMRC MTD ITSA assessment banners
- [ ] Webhook on proposal signed (Zapier/Make)
- [ ] Practice management export (CSV, API)

---

## Suggested implementation order

```
Week 1–2   Phase 1 (pricing + save reliability)
Week 2–3   Phase 3.1–3.3 (signature identity + certificate + audit UI)  ← your priority
Week 3–4   Phase 4 (tracking polish + reminders)
Week 4–5   Phase 2 (builder UX)
Week 5+    Phase 5–8 as capacity allows
```

---

## Definition of done — "World class"

- [ ] Partner can build and send a proposal in **under 5 minutes**
- [ ] Pricing is **correct** for every billing cycle; totals match PDF and client view
- [ ] Client can sign on mobile in **under 2 minutes**
- [ ] Signed proposal includes **verifiable audit trail** (identity + forensic data + document hash)
- [ ] Practice can **prove authenticity** via certificate PDF and audit panel
- [ ] E2E tests cover create → send → view → sign → PDF
- [ ] Zero P0 bugs in production for 30 days

---

## Quick reference — key files

| Area | Path |
|------|------|
| Public sign UI | `frontend/src/pages/public/ProposalView.tsx` |
| Signature pad | `frontend/src/components/signature/SignaturePad.tsx` |
| Sign API | `backend/src/routes/proposals-share.ts` |
| Record signature | `backend/src/services/proposalSharingService.ts` |
| Signature model | `backend/prisma/schema.prisma` → `ProposalSignature` |
| Staff detail / audit display | `frontend/src/pages/proposals/ProposalDetail.tsx` |
| Signed PDF | `backend/src/services/pdfGenerator.ts` |
