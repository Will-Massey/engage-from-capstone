/** Enable collectPaymentAtSign on Fortis tenant settings. */
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
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
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
  if (login.status !== 200) throw new Error('Login failed');
  const csrf = cookies.csrfToken;

  const patch = await api('/api/tenants/settings', {
    method: 'PUT',
    cookies,
    csrf,
    body: {
      payments: {
        collectPaymentAtSign: true,
        allowCard: true,
        allowDirectDebit: true,
      },
    },
  });
  console.log('Settings patch:', patch.status, JSON.stringify(patch.data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
