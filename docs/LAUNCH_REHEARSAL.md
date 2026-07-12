# Launch rehearsal — full commercial journey, end to end

One deliberate walk through every seam shipped in the Jul 2026 wave (PRs #52–#59 +
email verification + agentic Clara), in production, before a customer does it.
William clicks; Claude watches logs, webhooks, and the ActivityLog live.

**Pre-flight (must be done first, in Render/Stripe dashboards):**

- [ ] `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_*_PRICE_ID` set (subscribe button gates on these)
- [ ] `SENTRY_DSN` set
- [ ] Duplicate Connect webhook endpoint deleted (keep `we_1Trgh5…` — the 7-event one; check which `whsec_` is in Render first)
- [ ] `XAI_API_KEY` + `COMPANIES_HOUSE_API_KEY` rotated (old values are in git history)
- [ ] `ALLOW_PUBLIC_TENANT_SIGNUP=true` (only when ready to test signup; can be flipped back after)
- [ ] Optional: `XERO_CLIENT_ID/SECRET` if the OAuth app is approved (see docs/XERO_QBO_GOLIVE.md)

## Act 1 — Signup & verification (email-verification feature)

1. Fresh browser/incognito → `capstonesoftware.co.uk/engage/register`. Complete the
   wizard with a real inbox you control (use an M365 address — this doubles as the
   deliverability test).
2. **Expect:** "check your email" panel — NOT a logged-in session.
3. Check the inbox: verification email arrives, and note **which folder** (Inbox vs
   Junk — record for the deliverability verdict). Repeat later with a Gmail address.
4. Click the link → `/verify-email` → success → log in.
5. Negative checks: try logging in _before_ verifying (expect the resend panel);
   reuse the verification link (expect invalid-token message).

## Act 2 — Client & data enrichment

6. Add a client by Companies House lookup (a real ltd company number).
7. **Expect:** company details, year end, **accounts due date and confirmation-statement
   due date** populate (the CH persistence fix from #58). Set a turnover figure and
   an employee count on the client — this arms the regulatory rules.

## Act 3 — Proposal → sign → collect (the money path)

8. Build a proposal from a **library template** (Act 2's client): pick something like
   "Compliance Essentials" — confirms the 236-template library provisioned.
9. In the builder, check the **fee benchmark chips** render (only if
   `FEATURE_BENCHMARK_PRICING` flags are on — otherwise skip; needs opted-in tenants
   for real data either way).
10. Send the proposal (if the tenant has "require AML clearance" on, expect the
    409 block — good; run the AML demo check or toggle off for now).
11. Open the share link **on a phone**: sticky accept bar, wizard, signature pad
    (should be crisp — HiDPI fix from #55). Ask Clara a question on the sign page.
12. Sign. Pay with Stripe test card `4242 4242 4242 4242` (recurring lines create a
    subscription on the connected account; needs a Stripe Connect onboarded practice —
    do Connect onboarding first if this is a brand-new tenant).
13. **Expect within ~1 min:** payment status flips, split ledger rows written,
    `RECURRING_PAYMENT` activity on first invoice, MRR dashboard shows the engagement.
    (Claude watches the `stripe-connect` webhook deliveries + backend logs live.)

## Act 4 — Compliance & autopilot

14. Run an AML check in demo mode from the client page (provider panel shows
    demo badge; usage counter increments).
15. `POST /api/regulatory/scan` (or wait for the nightly): **expect signals** for the
    client armed in Act 2 (e.g. payroll gap if employeeCount ≥ 1 and no payroll
    service engaged). They appear in the Clara attention queue with dismiss buttons.
16. Enable **Clara autopilot** in Settings (the opt-in), run
    `POST /api/clara/run-drafting`: **expect** a drafted, priced proposal sitting in
    the **approval queue**, the source signal flipped to ACTIONED, and a "Clara draft"
    item in the attention queue.
17. Approve it as partner. Reject-path check optional but recommended once.

## Act 5 — Ops teardown

18. Confirm Sentry received _something_ (force a 404 storm or a known error path).
19. Check the uptime workflow's last runs are green (Actions → Uptime).
20. Tenant offboarding sanity: `GET /api/tenants/export` on the rehearsal tenant
    downloads the GDPR export. Then close the rehearsal account via
    `POST /api/tenants/close-account` (typed-name confirmation) — this is itself a
    feature test.
21. Flip `ALLOW_PUBLIC_TENANT_SIGNUP` back off if not launching yet.

## Verdicts to record

| Check                                         | Result       |
| --------------------------------------------- | ------------ |
| Verification email folder (M365 / Gmail)      | Inbox / Junk |
| Proposal email folder (M365 / Gmail)          | Inbox / Junk |
| Signature quality on phone                    |              |
| Webhook deliveries all 200 (Stripe dashboard) |              |
| Time signup → signed proposal                 |              |
| Anything that felt confusing (UX notes)       |              |

Junk placement on either provider → do the Postmark-style deliverability fix
(same playbook as Footnote PR #8) before launch.
