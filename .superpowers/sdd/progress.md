# Stripe Connect split payments — progress ledger

Branch: feat/stripe-connect-split-payments
Plan: docs/superpowers/plans/2026-07-09-stripe-connect-split-payments.md
Coordination: USER implements + commits each task; Claude reviews each commit (spec + quality). No implementer subagents.

Task 1: complete (ecfff21) — review CLEAN. Minor: vestigial `provider` param on estimateProcessorCost.
Task 2: complete (0da8a23) — review CLEAN. Note: branch won't typecheck until Task 5 (expected). Verify migration hit dev DB not prod.
Task 3: complete (437df35) — review CLEAN logic + tests 9/9. OPEN (Important): v2 payload shape unverified vs live API (as-any casts) — must run real createRecipientAccount (spike/Task10 smoke) before Task 7 onboarding goes live.
Task 4: complete (58bf36c) — review CLEAN. Matches plan.
Task 5: not started (rewrite payoutSettingsService + proposalPaymentStripe + paymentCollection).
Tasks 6-11: not started.

## Open findings requiring action before merge/go-live
- [IMPORTANT] T3: verify v2 accounts.create + accountLinks.create payload accepted by real Stripe API (blocked type-checking by `as any`).

## Minor findings roll-up (final review)
- T1: estimateProcessorCost single-valued `provider` param — collapse during Task 9 cleanup.

Task 5: complete (1e37efb) — review CLEAN. Checkout app_fee=engageRevenue + destination + no payment_method_types; enable-gate on stripe_transfers active; payout.ts stripped of Revolut fields. Tests 7/7. (Note: committed by user; my parallel edits converged/superseded.)
Task 6: not started (Connect webhook /api/webhooks/stripe-connect).
Tasks 7-11: partial — payout.ts Revolut strip already done in Task 5 commit.

## Branch typecheck landscape (as of 1e37efb)
- 3 errors = Revolut-removal fallout → Task 9 (business-client x2, publicSign revolut_pay).
- ~8 errors = PRE-EXISTING/env, NOT Stripe: @uk-proposal-platform/shared stale build (5), missing deps @sentry/node + rate-limit-redis (2). These WILL fail Task 9's "tsc clean" gate — resolve separately (shared rebuild + npm i).
- Branch scope is broad (~75 backend files vs master) — final whole-branch review must account for non-Stripe work too.
