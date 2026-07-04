# TODO — Sunday 5 July 2026

## Must do — UAT (browser)

1. ~~**Settings → Billing → Receive Payments Through Engage**~~ — demo tenant enabled via API (placeholder counterparty; needs `REVOLUT_BUSINESS_*` for real bank)
2. ~~**Client sign → Revolut checkout**~~ — `scripts/uat-payout-checkout-smoke.mjs` PASS (PROP-MQZ94TYF-0AO, prod Revolut)
3. **Revolut webhook** — confirm payout ledger + Superadmin payment events after live payment

## Must do — Xero integration

1. Set `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` on Render engage-backend
2. Settings → Integrations → Connect Xero (demo tenant)
3. Smoke: connect → disconnect → reconnect; verify mandate draft scaffold if applicable

## Quick verify (automated)

```powershell
cd e2e-tests
npx playwright test --config=playwright.build.config.ts specs/layout-smoke.spec.ts specs/payout-smoke.spec.ts --retries=0
node ../scripts/verify-superadmin-integration.mjs
```

## Done today (4 Jul)

- [x] Render: removed stale `SUPERADMIN_API_KEY` from engage-backend
- [x] UI layout smoke hardened (`data-testid` selectors)
- [x] Superadmin 6/6 API verify script

## Links

- Engage: https://capstonesoftware.co.uk/engage
- Backend: https://engage-backend-e1ue.onrender.com
- Render backend: https://dashboard.render.com/web/srv-d6qkjlua2pns73a2r1fg
- Demo login: `admin@demo.practice` / `DemoPass123!`