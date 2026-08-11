# E2E Testing for Engage

This directory contains end-to-end tests for the Engage proposal management system.

## Test Coverage

### Proposal Pricing Tests (`specs/proposal-pricing.spec.ts`)

- ✅ Annual service displays as monthly equivalent
- ✅ Changing billing frequency recalculates price
- ✅ Proposal total includes all services correctly

### VAT Calculation Tests (`specs/proposal-pricing.spec.ts`)

- ✅ Line-level VAT can be set per service
- ✅ Mixed VAT rates show as "Mixed" in totals
- ✅ VAT calculation is correct for each line

### CSRF Handling Tests (`specs/proposal-pricing.spec.ts`)

- ✅ Proposal creation works with valid CSRF token
- ✅ CSRF token auto-refreshes on expiry

## Running Tests

### Prerequisites

```bash
# Install Playwright
npm install -D @playwright/test
npx playwright install

# Set environment variables
export TEST_USER_EMAIL="admin@demo.practice"   # what `npm run db:seed` creates
export TEST_USER_PASSWORD="DemoPass123!"
export API_URL="http://localhost:3001/api"     # MUST end in /api, see below
export FRONTEND_URL="http://localhost:5173"
```

### Local environment gotchas

These cost a full afternoon once. Check them before concluding the app is broken.

**`backend/.env` wins, and it needs a restart.** The backend builds share URLs
from `FRONTEND_URL`. `backend/.env` is loaded with `override: true`, so exporting
`FRONTEND_URL` in your shell does **not** win — edit `backend/.env`. And `tsx
watch` does not reload on `.env` changes, so restart the backend. If the frontend
is not on the port `backend/.env` names, every public-proposal spec fails with a
confusing "title not visible", because the share link points somewhere else.
Verify with a real request rather than assuming the edit took effect.

**`EMAIL_DEV_LOG=true` is required** in `backend/.env` when no SMTP is configured.
`POST /proposals/:id/send` fails without it, so every signing spec fails.

**`API_URL` must include `/api`.** `fixtures/build-helpers.ts` normalises it, but
about ten specs interpolate `process.env.API_URL` directly and assume it is
already complete. Setting it without `/api` 404s those.

**Port 5173 may not be yours.** Another Vite project on the same machine can hold
it, and the OS may let a second dev server bind alongside rather than erroring —
requests then hit whichever answers. If logins fail with an error message that
does not exist in this codebase, that is what happened. Use `VITE_DEV_PORT` and
set `FRONTEND_URL` in `backend/.env` to match.

**The suite leaks clients.** It creates roughly ten per run and never removes
them. The demo tenant seeds as PROFESSIONAL (500 clients) so this is fine for
about fifty runs, but on Starter (50) it exhausts the tier after four and every
client-creating spec then fails with a 402 that surfaces much later as "client
card not found". `cd backend && npx prisma migrate reset --force --skip-seed &&
npm run db:seed` resets it.

### Never run the build config against its defaults

`playwright.build.config.ts` defaults `FRONTEND_URL` to
`https://capstonesoftware.co.uk/engage` — **production**. The money-path and
compliance specs create real clients and proposals, and it tests the deployed
code rather than your branch. Always pass explicit local URLs:

```bash
FRONTEND_URL=http://localhost:5173 API_URL=http://localhost:5173/api \
  npx playwright test --config=playwright.build.config.ts
```

### Run All Tests

```bash
npx playwright test
```

### Run Specific Tests

```bash
# Run only pricing tests
npx playwright test specs/proposal-pricing.spec.ts

# Run with UI mode
npx playwright test --ui

# Run in headed mode (see browser)
npx playwright test --headed
```

### Run Tests by Tag

```bash
# Run only pricing tests
npx playwright test --grep "pricing"

# Run only VAT tests
npx playwright test --grep "VAT"
```

## Test Configuration

Tests are configured in `playwright.config.ts`:

- Browsers: Chromium, Firefox, WebKit, Mobile Chrome
- Parallel execution in CI
- Screenshots and videos on failure
- HTML and JSON reports

## Test Data

Tests use:

- Pre-configured test user (partner@test.com)
- Dynamically created test clients
- Service catalog from database
- Cleanup after each test

## Debugging

```bash
# Debug mode
npx playwright test --debug

# Trace viewer
npx playwright show-trace test-results/trace.zip

# View report
npx playwright show-report
```

## MCP Integration

The tests can be run via MCP (Model Context Protocol) for automated debugging:

```bash
# Start MCP test server
node scripts/mcp-test-server.js
```

Then use the MCP tools to run specific tests programmatically.

## Continuous Integration

Add to your CI pipeline:

```yaml
- name: Run E2E Tests
  run: |
    npx playwright test

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  if: failure()
  with:
    name: test-results
    path: test-results/
```
