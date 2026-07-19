# Design — One-screen proposal signing + AML document viewer

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**Author:** William + Claude

Two independent features, one release train.

## Feature 1 — One-screen proposal signing

### Problem

The public signing flow is a 5–7 step wizard (Review → Terms → Engagement → Identity → Sign → Payment → Confirmation) with four separate checkboxes and three typed identity fields the practice already knows. Clients experience friction at the exact moment we want zero friction.

### Design

The public proposal page (`ProposalView.tsx`) keeps its content. "Accept proposal" opens a single **Sign card** replacing the wizard steps `review`/`terms`/`engagement`/`identity`/`sign`:

- **Documents**: Terms and Engagement letter as collapsible sections (collapsed by default; engagement section only rendered when a letter exists). Full text stays in-page — reading is one tap, never a download.
- **Identity**: `signerName`/`signerEmail` prefilled from the proposal's client contact (`contactName`, `contactEmail`); `signerRole` empty with placeholder "Director". All three editable. Same validation as today (all required).
- **One consent checkbox**, dynamic label: *"I have read and agree to the terms and conditions[ and the engagement letter], and I confirm I am authorised to sign on behalf of {client name}."* The rendered sentence is sent as `consentText` and stored on the signature record — the audit evidence explicitly names every accepted document.
- **Signature**: two tabs.
  - **Draw** — existing `SignaturePad`, unchanged.
  - **Type** — new `TypedSignatureInput`: signer types their name, live-rendered onto a canvas in a bundled cursive webfont (bundled, not a CDN font, so rendering is deterministic and works offline); produces the same PNG data-URL contract as the pad. Signature method (`drawn`/`typed`) is recorded inside the existing `deviceInfo` JSON blob (no schema change).
- **Sign & accept** submits via the existing `buildPublicSignPayload` path with `agreementAccepted: true` and (when a letter exists) `engagementLetterAccepted: true` derived from the single tick. Backend contract untouched.
- **After signing**: unchanged — `payment` step if collect-at-sign is enabled, then `confirmation`.

Client journey: open link → tick → sign → done.

### Code shape (frontend-only)

- `publicSigning.ts`: `SigningStep` narrows to `'sign' | 'payment' | 'confirmation'`; `buildSigningSteps` returns the single sign step (+ downstream); payload builder gains the combined-consent mapping; new `buildCombinedConsentText(clientName, hasEngagementLetter)`.
- `ProposalView.tsx`: four wizard step blocks replaced by the Sign card; step-progress header shows nothing pre-payment (single screen).
- New `frontend/src/components/proposals/TypedSignatureInput.tsx` (canvas render, `onSave(dataUrl)` same contract as `SignaturePad`).
- No backend, schema, or PDF changes. `documentHash` logic untouched.

### Testing

- Rewrite `publicSigning.test.ts`: step list, combined consent text (with/without engagement letter), payload mapping from single tick.
- New unit test: typed signature renders a non-empty PNG data-URL and round-trips through `collectSignatureValidationErrors`.
- Playwright E2E signing journey updated to the single-screen flow; existing `data-testid`s (`signer-name-input`, `signer-email-input`, `signer-role-input`, `authorised-checkbox`→`consent-checkbox`) kept/renamed deliberately.
- Post-deploy manual smoke on a real proposal.

### Trade-offs / decisions

- Documents collapsed by default (industry norm — DocuSign-style). Consent text is the legal anchor, not forced scrolling.
- Typed signatures are valid UK e-signatures; evidence quality unchanged (consent text + hash + device info + IP).
- E2E churn is the main cost and is accepted.

## Feature 2 — AML document viewer (practice-facing)

### Problem

Clients upload photo ID + proof of address via the public onboarding portal; files land in R2 (`aml-documents/<tenantId>/<clientId>/…`) with metadata in `Client.amlSubmissionData`. There is **no practice-facing read path** — staff cannot review the documents they are required to check. Write-only compliance is no compliance.

### Design

- **Backend** (`routes/aml.ts`): `GET /api/aml/documents/:clientId/:type` where `type ∈ photo_id | proof_of_address`.
  - `authenticate` + `authorize('ADMIN', 'PARTNER', 'MANAGER')` (same roles as `/aml/check`).
  - Client must belong to `req.tenantId` (404 otherwise — no existence leak).
  - File path resolved **server-side** from `Client.amlSubmissionData` JSON (`photoIdDocument.relativePath` / `proofOfAddressDocument.relativePath`). No user-supplied paths.
  - Streams bytes via `fileStorage` read (R2 or disk), `Content-Type` from stored metadata, `Content-Disposition: inline; filename="<sanitised original name>"` (reuse the non-Latin-1 sanitising lesson — ASCII-safe filename).
  - Writes an activity-log entry `CLIENT_AML_DOCUMENT_VIEWED` (tenant, user, client, type) — the review itself becomes audit evidence.
  - `fileStorage.ts` gains `readAmlDocument(relativePath): Buffer` (thin wrapper over existing `readBytes`).
- **Frontend** (`AmlPartnerPanel.tsx` on the client page): when the AML status payload says a submission exists, show a **Documents** block: two rows (Photo ID, Proof of address) with original filename, size, uploaded date, and View/Download buttons. Fetch as blob through the authed `api` instance → object URL → open in new tab (View) or anchor download (Download). The status endpoint (`getAmlStatusForClient`) is extended to include the two documents' display metadata (name, size, uploadedAt — never paths).

### Testing

- Backend route tests: happy path streams correct bytes + content type; cross-tenant 404; missing submission 404; role enforcement 403; activity log written.
- Frontend: panel renders document rows from status payload; buttons call the endpoint.

### Trade-offs / decisions

- Streaming through the backend (not presigned R2 URLs): keeps auth/tenancy/audit in one place, avoids exposing bucket URLs; ID documents are small (≤10 MB) so proxying is fine.
- `inline` disposition with a sanitised ASCII filename; browser preview for images/PDF.

## Rollout

One branch per feature (`feat/one-screen-signing`, `feat/aml-document-viewer`), TDD, full suites + tsc ×2, separate PRs so E2E churn (signing) can't block the viewer. Viewer ships first (smaller, unblocks Caroline's manual AML review of the Capstone submission).
