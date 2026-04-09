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
export TEST_USER_EMAIL="partner@test.com"
export TEST_USER_PASSWORD="test123"
export API_URL="http://localhost:3001/api"
export FRONTEND_URL="http://localhost:5173"
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
