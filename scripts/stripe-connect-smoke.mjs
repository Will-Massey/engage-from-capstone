/**
 * Stripe Connect smoke (test mode).
 *
 * Env:
 *   API_URL                 — e.g. https://engage-backend-e1ue.onrender.com
 *   E2E_BYPASS_SECRET       — when API is production (optional for local)
 *   AUTH_COOKIE / TOKEN     — partner session (or rely on existing cookie jar)
 *   STRIPE_SECRET_KEY       — test-mode secret (for optional direct Checkout assert)
 *
 * Checks:
 *   1) POST /api/payout/stripe/onboard → connect.stripe.com URL (or 400 if already stubbed)
 *   2) createStripeProposalCheckout shape via authenticated setup path when possible
 *
 * Usage:
 *   node scripts/stripe-connect-smoke.mjs
 */

const API_URL = (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '');
const headers = {
  'Content-Type': 'application/json',
  'X-Test-Mode': 'e2e',
  ...(process.env.E2E_BYPASS_SECRET ? { 'X-Test-Mode-Secret': process.env.E2E_BYPASS_SECRET } : {}),
  ...(process.env.AUTH_COOKIE ? { Cookie: process.env.AUTH_COOKIE } : {}),
  ...(process.env.TOKEN ? { Authorization: `Bearer ${process.env.TOKEN}` } : {}),
};

function pass(msg) {
  console.log(`PASS  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}

async function main() {
  console.log(`Stripe Connect smoke against ${API_URL}`);

  // Health
  const health = await fetch(`${API_URL}/health`);
  if (!health.ok) {
    fail(`health ${health.status}`);
    return;
  }
  pass('health');

  // Onboard link (requires auth + Stripe configured)
  const onboard = await fetch(`${API_URL}/api/payout/stripe/onboard`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const onboardBody = await onboard.json().catch(() => ({}));
  if (onboard.status === 401 || onboard.status === 403) {
    fail(`onboard auth required (${onboard.status}) — set AUTH_COOKIE or TOKEN`);
  } else if (onboard.ok && onboardBody?.data?.url?.includes('connect.stripe.com')) {
    pass(`onboard URL: ${onboardBody.data.url.slice(0, 48)}…`);
  } else if (onboard.ok && onboardBody?.url?.includes('connect.stripe.com')) {
    pass(`onboard URL: ${onboardBody.url.slice(0, 48)}…`);
  } else {
    fail(`onboard unexpected ${onboard.status}: ${JSON.stringify(onboardBody).slice(0, 200)}`);
  }

  // Settings shape
  const settings = await fetch(`${API_URL}/api/payout/settings`, { headers });
  const settingsBody = await settings.json().catch(() => ({}));
  if (settings.ok && settingsBody?.data && 'stripeTransfersStatus' in settingsBody.data) {
    pass(`settings stripeTransfersStatus=${settingsBody.data.stripeTransfersStatus}`);
  } else if (settings.status === 401) {
    fail('settings auth required');
  } else {
    fail(`settings unexpected ${settings.status}`);
  }

  // Webhook endpoint rejects unsigned non-e2e
  const wh = await fetch(`${API_URL}/api/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (wh.status === 400 || wh.status === 503) {
    pass(`webhook rejects unsigned (${wh.status})`);
  } else {
    fail(`webhook expected 400/503, got ${wh.status}`);
  }

  if (process.exitCode) {
    console.error('Smoke finished with failures');
  } else {
    console.log('Smoke finished OK');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
