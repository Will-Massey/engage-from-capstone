# Test-Coverage Gap Audit — 2026-07-07

## Headlines

- Backend jest: **28% stmts / 17.5% branches — and overstated**: no
  `collectCoverageFrom` in `backend/jest.config.cjs`, so never-imported files
  are invisible (all of `routes/` ≈ 13k lines shows as nothing). The only two
  supertest HTTP suites (`tests/smoke/*.test.ts`, incl. tenant isolation!) are
  **excluded from the default run** via `--testPathIgnorePatterns=/smoke/`.
- Frontend: 18 vitest tests / 4 files. **`api.csrf.test.ts` is tautological**
  — imports nothing, asserts on its own inline re-implementation. Real
  coverage of `utils/api.ts` (1,135 lines of interceptors/refresh/CSRF): 0%.
- **Money path untested from the moment money moves**: sign is e2e-covered;
  payment setup, Revolut webhook signature/fulfilment idempotency, and payout
  split persistence have zero tests.

## Worst-covered business-logic files (0% unless noted)

`proposalsShare/publicSign.ts` (504), `services/paymentCollection.ts` (289),
`lib/revolut/{fulfilment,splits,webhook}.ts` (399), `services/gdprService.ts`
(517), `services/amlService.ts` (510), `services/renewalProposalService.ts`
(675), `services/xeroService.ts` (573), `routes/proposals/lifecycle.ts` (545),
`middleware/auth.ts`, `services/pdfGenerator.ts` (4%), email services (~5-9%),
jobs (~9-10%), `services/proposalSharingService.ts` (14%),
`utils/signatureAudit.ts` (24%), `utils/encryption.ts` (24%).

Genuinely solid: pricing engine (84-100%), splitCalculator (87%),
passwordPolicy (100%), tenant subdomain resolution, snapshot tests.

## e2e journey gaps

Covered well: create+pricing, share link, public view, e-sign+audit.
Partial: approvals (no reject/role-denial), portal, agency (no isolation
assertion), renewals (page-loads only).
Missing entirely: proposal payment (`/view/:token/payment/*`), Stripe platform
billing + webhook, AML flow, Xero/QB beyond page-load, GDPR export/close,
tenant signup→first proposal, decline flow.

## Flake risks

`proposal-share.spec.ts` (`networkidle`, `waitForTimeout`), data-coupled specs
(first-client-in-tenant), real-clock unit tests (csrfStore, loginLockout,
tierLimits, touchpointEngine); `renewalReminders.ts` wall-clock-driven —
inject `now` to make BST/GMT testable.

## Top-20 missing tests (prioritized, S/M/L)

1. Revolut webhook → fulfilment (sig reject, idempotent redelivery) — M
2. `splits.ts` fee-bps math + single split row — S
3. `payment/setup|skip|status` supertest via share token — M
4. e2e sign → pay (mocked provider) → paid state — L
5. Stripe platform webhook events → subscription mutations — M
6. `middleware/auth.ts` supertest (expired/tampered/tenant mismatch) — S
7. Cross-tenant isolation matrix (promote smoke tests into default run) — M
8. Real `api.ts` interceptor tests (replace tautological suite) — M
9. `signatureAudit.ts` unit (actor/IP capture, ordering) — S
10. Double-sign / tampered-sign rejection — S
11. Renewal uplift units (+date-boundary) — M
12. AML initiate/webhook transitions — M
13. GDPR export completeness / close-account retention — M
14. Approval reject + role-denial — S
15. Send lifecycle (token mint, email queued, idempotent resend) — M
16. Share-token expiry/revocation — S
17. ProposalBuilder state tests (draft restore, step gating) — L
18. Xero token refresh + invoice push mapping — M
19. Job clock determinism (inject now, fake timers) — M
20. Tenant signup → onboarding e2e — L

**Structural quick wins first**: add `collectCoverageFrom: ['src/**/*.ts']`;
un-exclude smoke tests (or dedicated CI job).

_Correction from review: the audit claimed e2e is not CI-gated — it is;
CI starts the servers itself (`.github/workflows/playwright-e2e.yml`)._
