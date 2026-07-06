#!/usr/bin/env node
/**
 * UAT smoke: demo tenant payout enabled → client sign → Revolut checkout setup.
 */
const API = (process.env.API_URL || 'https://capstonesoftware.co.uk/engage').replace(/\/$/, '');
const API_BASE = API.endsWith('/api') ? API : `${API}/api`;
const ORIGIN = process.env.FRONTEND_ORIGIN || 'https://capstonesoftware.co.uk';
const EMAIL = process.env.TEST_USER_EMAIL || 'admin@demo.practice';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'DemoPass123!';

const FAKE_SIG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.repeat(
    2
  );

function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const line of setCookieHeaders) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function api(path, { method = 'GET', body, jar } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    'X-Test-Mode': 'e2e-build',
    ...(process.env.E2E_BYPASS_SECRET
      ? { 'X-Test-Mode-Secret': process.env.E2E_BYPASS_SECRET }
      : {}),
  };
  if (jar?.csrfToken) headers['X-CSRF-Token'] = jar.csrfToken;
  if (jar && Object.keys(jar).length) headers.Cookie = cookieHeader(jar);

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookies = res.headers.getSetCookie?.() || [];
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookies };
}

async function login() {
  const res = await api('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!res.json?.success) throw new Error(`Login failed (${res.status})`);
  const jar = parseCookies(res.setCookies);
  if (res.json.data?.csrfToken) jar.csrfToken = res.json.data.csrfToken;
  return jar;
}

async function main() {
  console.log('[uat] Login…');
  const jar = await login();

  console.log('[uat] Payout settings…');
  const payout = await api('/payout/settings', { jar });
  if (!payout.json?.success)
    throw new Error(`Payout settings failed: ${JSON.stringify(payout.json)}`);
  const { enabled, collectPaymentAtSign } = payout.json.data;
  console.log(`  enabled=${enabled} collectPaymentAtSign=${collectPaymentAtSign}`);
  if (!enabled || !collectPaymentAtSign) {
    throw new Error('Demo tenant payout not enabled');
  }

  console.log('[uat] Find SENT proposal…');
  const proposals = await api('/proposals?limit=30', { jar });
  if (!proposals.json?.success) throw new Error('List proposals failed');

  const list = proposals.json.data || [];
  const proposal =
    list.find((p) => p.status === 'SENT' && Number(p.total ?? 0) > 0) ||
    list.find((p) => p.status === 'SENT');
  if (!proposal) throw new Error('No SENT proposal — send one from Engage first');
  console.log(`  using ${proposal.reference} total=${proposal.total}`);

  console.log('[uat] Share link…');
  const share = await api(`/proposals/${proposal.id}/share`, {
    method: 'POST',
    body: { expiryDays: 7 },
    jar,
  });
  if (!share.json?.success) throw new Error(`Share failed: ${JSON.stringify(share.json)}`);
  const shareToken = share.json.data.shareUrl.split('/view/')[1]?.split(/[?#]/)[0];
  if (!shareToken) throw new Error('Could not parse share token');

  console.log('[uat] Client sign…');
  const sign = await api(`/proposals/view/${shareToken}/sign`, {
    method: 'POST',
    body: {
      signedBy: 'UAT Signer',
      signedByRole: 'Director',
      signerEmail: 'uat-signer@example.com',
      signatureData: FAKE_SIG,
      agreementAccepted: true,
      authorisedToSign: true,
    },
  });
  if (!sign.json?.success) throw new Error(`Sign failed: ${JSON.stringify(sign.json)}`);
  console.log(`  paymentRequired=${sign.json.data?.paymentRequired}`);

  if (!sign.json.data?.paymentRequired) {
    console.log('[uat] WARN: payment not required (zero-value proposal?)');
    process.exit(0);
  }

  console.log('[uat] Revolut checkout setup…');
  const setup = await api(`/proposals/view/${shareToken}/payment/setup`, {
    method: 'POST',
    body: { paymentAuthAccepted: true, preferredMethod: 'card' },
  });
  if (!setup.json?.success) throw new Error(`Payment setup failed: ${JSON.stringify(setup.json)}`);

  const { provider, checkoutUrl, token: checkoutToken, mode } = setup.json.data || {};
  console.log(
    `  provider=${provider} mode=${mode} checkoutUrl=${!!checkoutUrl} token=${!!checkoutToken}`
  );
  if (provider !== 'revolut' || (!checkoutUrl && !checkoutToken)) {
    throw new Error('Revolut checkout not returned');
  }
  console.log('[uat] PASS — sign → Revolut checkout OK');
}

main().catch((err) => {
  console.error('[uat] FAIL:', err.message);
  process.exit(1);
});
