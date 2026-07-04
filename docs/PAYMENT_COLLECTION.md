# Engage — Receive Payments Through Engage (Revolut v1)

**Last updated:** 4 July 2026

## Overview

Accountants can opt in to collect client engagement fees through Engage. Payments are processed via **Revolut Merchant**; Capstone deducts platform and processing fees, then pays the net amount to the practice's nominated UK bank account via **Revolut Business**.

Direct Debit (GoCardless) is planned — not enabled in this release.

## Practice setup

1. **Settings → Billing → Receive Payments Through Engage**
2. Accept [Payment Collection Terms](/legal/payment-collection-terms) (v`ENGAGE-PCT-2026-001`)
3. Enter UK sort code + account number (encrypted at rest)
4. Enable **Collect payment after signing**
5. Save — Revolut counterparty is created automatically when Business API is configured

## Client flow

1. Review proposal → Terms → Engagement letter (if present) → Identity → Sign
2. If payment collection enabled: **Payment** step
3. Accept [Client Payment Authorisation](/legal/client-payment-authorisation) (v`ENGAGE-CPA-2026-001`)
4. Revolut secure checkout
5. Webhook `ORDER_COMPLETED` → split ledger → payout to practice

## Fees

| Component | Default |
|-----------|---------|
| Platform fee | 2.5% (1.0% Enterprise) |
| Processor cost | Estimated Revolut merchant rate |
| Processing markup | `ENGAGE_PROCESSOR_MARKUP_BPS` (default 0.5%) |

Configure via environment:

- `ENGAGE_PLATFORM_FEE_BPS`
- `ENGAGE_PROCESSOR_MARKUP_BPS`
- `ENGAGE_REVOLUT_PROCESSOR_BPS`

## API

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/payout/settings` | Practice user | Masked payout settings |
| `PUT /api/payout/settings` | ADMIN/PARTNER | Opt-in, bank details, methods |
| `GET /api/payout/ledger` | ADMIN/PARTNER/MD | Split history |
| `POST /api/proposals/view/:token/payment/setup` | Public (share token) | Create Revolut checkout |
| `POST /api/billing/webhook` | Revolut HMAC | Fulfilment + split |

## Legal documents

- `/legal/payment-collection-terms` — practice opt-in
- `/legal/client-payment-authorisation` — client checkout consent
- `/legal/terms` — platform ToS (section 4a references payment collection)