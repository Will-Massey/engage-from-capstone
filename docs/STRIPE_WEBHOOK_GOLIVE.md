# Stripe webhook go-live — dispute handling + recurring fees

The dispute/refund handlers and recurring-invoice handlers (PR #47, #48) only
fire once the Stripe webhook endpoint is subscribed to the events below. This
is the final, deliberate go-live gate — do it after the code is deployed.

## Which endpoint

The **platform-scoped** endpoint pointing at
`https://<backend-host>/api/webhooks/stripe-connect` — the one whose signing
secret is `STRIPE_CONNECT_WEBHOOK_SECRET` in Render. (Destination charges put
disputes, refunds and subscription invoices on the **platform** account, not
the connected accounts, so the connected-account-scoped endpoint won't receive
them.)

## Events to add

- `charge.dispute.created` — reverses the practice transfer to cover the chargeback
- `charge.dispute.closed` — re-pays the practice if won
- `charge.refunded` — tracks refund status (partial refunds logged only)
- `invoice.paid` — recurring payment received (MRR)
- `invoice.payment_failed` — recurring payment failed (dunning)

## Via dashboard

Stripe Dashboard → Developers → Webhooks → select the endpoint → *Update
details* → add the five events.

## Via CLI (equivalent)

```bash
# Find the endpoint id (we_...) for /api/webhooks/stripe-connect
stripe webhook_endpoints list --live

stripe webhook_endpoints update we_XXXX --live \
  --enabled-events charge.dispute.created \
  --enabled-events charge.dispute.closed \
  --enabled-events charge.refunded \
  --enabled-events invoice.paid \
  --enabled-events invoice.payment_failed \
  # ...plus the events already enabled (update replaces the list — include
  # checkout.session.completed and account.updated!)
```

**Warning:** `webhook_endpoints update` *replaces* `enabled_events` — include
the existing events (`checkout.session.completed`, `account.updated`, and any
others) or existing payment fulfilment breaks.

## Verify after subscribing

1. Stripe Dashboard → the endpoint → send a test `invoice.paid` event → expect
   HTTP 200 and (with real metadata) a `RECURRING_PAYMENT` activity-log row.
2. Trigger a test dispute in test mode (card `4000000000000259`), confirm the
   proposal flips to `DISPUTED` and the transfer reversal appears.
3. The daily `disputeReconciliation` job (backend logs, 3 min after boot, then
   24h) is the backstop if an event is missed.
