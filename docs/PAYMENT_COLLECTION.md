# Engage — Receive Payments Through Engage (Stripe Connect)

**Last updated:** 9 July 2026

## Overview

Accountants can opt in to collect client engagement fees through Engage. Payments are processed via **Stripe Checkout** with **destination charges**: Capstone is merchant of record, deducts platform and processing fees via `application_fee_amount`, and Stripe transfers the remainder to the practice's **Stripe Connect** recipient account.

## Practice setup

1. **Settings → Billing → Receive Payments Through Engage**
2. Click **Connect with Stripe** and complete hosted onboarding
3. Wait until status shows **Connected** (`stripe_transfers` active)
4. Accept [Payment Collection Terms](/legal/payment-collection-terms) (v`ENGAGE-PCT-2026-001`)
5. Enable collection and optionally **Collect payment after signing**
6. Save

## Client flow

1. Review proposal → Terms → Engagement letter (if present) → Identity → Sign
2. If payment collection enabled: **Payment** step
3. Accept [Client Payment Authorisation](/legal/client-payment-authorisation) (v`ENGAGE-CPA-2026-001`)
4. Redirect to Stripe Checkout
5. Webhook `checkout.session.completed` → proposal `paymentStatus = PAID`

## Fees

| Component         | Default                                      |
| ----------------- | -------------------------------------------- |
| Platform fee      | 2.5% (1.0% Enterprise)                       |
| Processor cost    | Estimated Stripe UK card (~1.5% + 20p)       |
| Processing markup | `ENGAGE_PROCESSOR_MARKUP_BPS` (default 0.5%) |

Configure via environment:

- `ENGAGE_PLATFORM_FEE_BPS`
- `ENGAGE_PROCESSOR_MARKUP_BPS`
- `ENGAGE_STRIPE_PROCESSOR_BPS`
- `ENGAGE_STRIPE_PROCESSOR_FIXED_PENCE`

## API

| Endpoint                                        | Auth                 | Purpose                          |
| ----------------------------------------------- | -------------------- | -------------------------------- |
| `GET /api/payout/settings`                      | Practice user        | Connect status + settings        |
| `PUT /api/payout/settings`                      | ADMIN/PARTNER        | Opt-in (requires Connect active) |
| `POST /api/payout/stripe/onboard`               | ADMIN/PARTNER        | Hosted Account Link URL          |
| `GET /api/payout/ledger`                        | ADMIN/PARTNER/MD     | Split history                    |
| `POST /api/proposals/view/:token/payment/setup` | Public (share token) | Create Stripe Checkout Session   |
| `POST /api/webhooks/stripe-connect`             | Stripe signature     | Fulfilment + capability sync     |

## Env (Render)

- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_CONNECT_WEBHOOK_SECRET` (and optional `STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET`)

## Legal documents

- `/legal/payment-collection-terms` — practice opt-in
- `/legal/client-payment-authorisation` — client checkout consent
- `/legal/terms` — platform ToS
