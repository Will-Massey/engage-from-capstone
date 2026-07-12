# Xero + QuickBooks Online — Go-Live Runbook (R4.1)

Everything except the app credentials is already in place. Register the two
apps, set the env vars in Render, and both integrations go live.

## 1. Register the apps

### Xero

1. Go to <https://developer.xero.com/app/manage> → **New app** → Web app.
2. Company/app name: Engage by Capstone. App URL: `https://capstonesoftware.co.uk/engage`.
3. Redirect URI (must match exactly):

   ```
   https://capstonesoftware.co.uk/engage/api/oauth/callback/xero
   ```

4. Scopes requested by Engage (no action needed in the portal — Xero grants
   scopes per consent request):

   ```
   openid profile email offline_access accounting.contacts accounting.transactions accounting.settings
   ```

5. Copy the **Client id** and generate a **Client secret**.

### QuickBooks Online

1. Go to <https://developer.intuit.com/app/developer/dashboard> → **Create an app**
   → QuickBooks Online and Payments.
2. Scope: `com.intuit.quickbooks.accounting`.
3. Under **Keys & credentials**, add the redirect URI (must match exactly):

   ```
   https://capstonesoftware.co.uk/engage/api/oauth/callback/quickbooks
   ```

4. The app has two key sets — **Development** keys work against the sandbox
   company, **Production** keys require completing Intuit's app assessment
   before they are issued. Copy the Client ID and Client Secret for the
   environment you are targeting.

## 2. Environment variables (Render → engage-backend)

Declared in `render.yaml`; set the secret ones in the dashboard:

| Variable                   | Value                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XERO_CLIENT_ID`           | from the Xero app (secret, `sync: false`)                                                                                                                         |
| `XERO_CLIENT_SECRET`       | from the Xero app (secret, `sync: false`)                                                                                                                         |
| `XERO_REDIRECT_URI`        | `https://capstonesoftware.co.uk/engage/api/oauth/callback/xero`                                                                                                   |
| `QUICKBOOKS_CLIENT_ID`     | from the Intuit app (secret, `sync: false`)                                                                                                                       |
| `QUICKBOOKS_CLIENT_SECRET` | from the Intuit app (secret, `sync: false`)                                                                                                                       |
| `QUICKBOOKS_REDIRECT_URI`  | `https://capstonesoftware.co.uk/engage/api/oauth/callback/quickbooks`                                                                                             |
| `QUICKBOOKS_SANDBOX`       | `false` in production (`false` → `quickbooks.api.intuit.com`; anything else → `sandbox-quickbooks.api.intuit.com`). The OAuth authorize URL is the same for both. |

Tokens are AES-256-GCM encrypted (ENCRYPTION_KEY) on `Tenant.settings.xero` /
`Tenant.settings.quickbooks`; access tokens are refreshed on read with a 60s
expiry skew.

## 3. The two Xero sync modes (Settings → Integrations → Xero)

| Mode                        | On acceptance                                                              | On each Stripe recurring payment                                                                                                                                                                                                    | Double-billing risk                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repeating_draft` (default) | Contact + history note + **DRAFT repeating invoice** per billing frequency | nothing                                                                                                                                                                                                                             | If you APPROVE the draft repeating invoices while Stripe is also collecting the same fees, the client is billed twice. Use when **Xero** is your billing engine and Stripe payment collection is off/one-off only. |
| `paid_invoices`             | Contact + history note only (no repeating invoices)                        | **AUTHORISED ACCREC invoice** in Xero, Reference = the Stripe invoice id. If a payment account code is set, a Payment is applied for the same amount (Stripe already collected it); otherwise the invoice is left awaiting payment. | None — Xero only ever mirrors money Stripe actually collected. Use when **Stripe** is your billing engine.                                                                                                         |

Line items in `paid_invoices` mode: if one billing-frequency group of the
proposal's recurring lines sums (gross) exactly to Stripe's `amount_paid`, those
lines are used with their VAT split; otherwise a single line
"Recurring fees — <proposal title>" for `amount_paid` is used so the Xero
invoice always matches the money collected (first invoices that include one-off
items land here by design).

Other Xero settings:

- **Auto-push on acceptance** (default on): accepted proposals push to Xero
  automatically. Pushes are idempotent — a `XERO_PROPOSAL_PUSHED` activity
  record marks success and re-pushes are skipped unless
  `POST /api/xero/push-proposal/:id?force=true` is used.
- **Payment account code**: the Xero account (e.g. a Stripe clearing account)
  payments are applied against in `paid_invoices` mode.

## 4. QuickBooks behaviour

QBO has no low-risk equivalent of Xero's DRAFT repeating invoices (recurring
transactions bill live), so QBO tenants get **paid-invoice sync only**:

- Each Stripe recurring payment creates a QBO invoice (gross amounts,
  `GlobalTaxCalculation: NotApplicable`; the Stripe invoice id is in the
  private note). Idempotent via `QBO_INVOICE_SYNCED` activity records.
- If a `paymentAccountId` is set (`POST /api/quickbooks/settings`), a Payment
  is recorded against that deposit account; otherwise invoices are left unpaid.
- `POST /api/quickbooks/import-clients` (supports `{"dryRun": true}`) imports
  customers as Engage clients, deduped by email/name, linked via a
  `qbo:<Id>` tag (mirrors the `xero:<contactID>` convention).
- `POST /api/quickbooks/push-proposal/:id` (supports `?force=true`) manually
  creates an unpaid QBO invoice from an accepted proposal's recurring lines
  (`QBO_PROPOSAL_PUSHED` idempotency).

## 5. Post-credentials verification script

Run once per integration after setting the env vars (staff user with
ADMIN/PARTNER/MANAGER role):

1. **Connect** — Settings → Integrations → Connect Xero / Connect QuickBooks;
   complete consent; the panel should show "Connected" with the
   organisation/company name.
2. **Dry-run import** —

   ```bash
   curl -s -X POST "$API/api/xero/import-clients" -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' -d '{"dryRun": true}'
   curl -s -X POST "$API/api/quickbooks/import-clients" -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' -d '{"dryRun": true}'
   ```

   Check `created`/`skipped` counts look sane, then re-run without `dryRun`.

3. **Accept a test proposal** — create a proposal for an imported client with a
   MONTHLY service line, send it, sign via the public link.
4. **Check the artifacts**:
   - Xero `repeating_draft`: Business → Invoices → Repeating — a DRAFT
     repeating invoice referencing the proposal; the contact has an
     `[Engage] Accepted proposal …` history note.
   - Xero `paid_invoices`: after the first Stripe `invoice.paid` webhook, an
     AUTHORISED invoice whose Reference is the Stripe invoice id (marked paid
     if a payment account code is set).
   - QuickBooks: after `invoice.paid`, an invoice for the client with the
     Stripe invoice id in the private note; or push manually via
     `POST /api/quickbooks/push-proposal/:id`.
   - Re-accepting/re-pushing must NOT duplicate artifacts (idempotency skips —
     look for "already pushed"/skip messages; `?force=true` overrides).
5. **Webhook safety check** — Stripe Dashboard → Webhooks: `invoice.paid`
   deliveries must show 200 even if an accounting sync fails (failures only
   appear as `warn` logs in Render).
