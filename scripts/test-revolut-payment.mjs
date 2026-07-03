/**
 * Test post-sign payment flow on production engage-backend.
 * Usage: node scripts/test-revolut-payment.mjs [shareToken]
 */
const BASE = 'https://engage-backend-e1ue.onrender.com';

function parseSetCookies(headers) {
  const raw = headers.getSetCookie?.() || [];
  const jar = {};
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(path, { method = 'GET', body, cookies = {}, csrf } = {}) {
  const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader(cookies) };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  Object.assign(cookies, parseSetCookies(res.headers));
  return { status: res.status, data, cookies };
}

async function main() {
  let cookies = {};
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'caroline@fortisaccounts.com', password: 'Caroline2026!' },
    cookies,
  });
  if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.data));
  const csrf = cookies.csrfToken;

  const paymentsConfig = await api('/api/payments/config', { cookies });
  console.log('Staff payments config:', JSON.stringify(paymentsConfig.data?.data, null, 2));

  const listRes = await api('/api/proposals?limit=20&status=ACCEPTED', { cookies });
  const items = listRes.data?.data?.proposals || listRes.data?.data || [];
  const accepted = items.find((p) => p.shareToken) || items[0];
  if (!accepted?.shareToken) {
    console.log('No accepted proposal with share token — run resend-caroline-proposal.mjs first');
    process.exit(1);
  }

  const shareToken = process.argv[2] || accepted.shareToken;
  console.log('Testing share token:', shareToken);

  const view = await api(`/api/proposals/view/${shareToken}`);
  console.log('Proposal status:', view.data?.data?.status, 'total:', view.data?.data?.total);
  console.log('Payment config:', JSON.stringify(view.data?.data?.payment, null, 2));

  if (view.data?.data?.status !== 'ACCEPTED') {
    console.log('Proposal not accepted — payment step only runs after sign');
    process.exit(0);
  }

  const setup = await api(`/api/proposals/view/${shareToken}/payment/setup`, {
    method: 'POST',
    body: { preferredMethod: 'card' },
  });
  console.log('Payment setup:', setup.status, JSON.stringify(setup.data, null, 2));

  if (setup.data?.data?.provider === 'revolut' && setup.data?.data?.token) {
    console.log('OK: Revolut checkout token received (mode:', setup.data.data.mode, ')');
  } else if (setup.data?.data?.isStub) {
    console.log('OK: Demo stub flow active (Revolut not configured on Render)');
  } else {
    console.log('Unexpected payment setup response');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});