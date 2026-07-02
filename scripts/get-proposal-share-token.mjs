const BASE = 'https://engage-backend-e1ue.onrender.com';
const REF = process.argv[2] || 'PROP-MR3YM5F3-4QH';

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

async function main() {
  let cookies = {};
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'caroline@fortisaccounts.com', password: 'Caroline2026!' }),
  });
  Object.assign(cookies, parseSetCookies(login.headers));
  const loginData = await login.json();
  if (!login.ok) throw new Error(JSON.stringify(loginData));
  const csrf = cookies.csrfToken;

  const list = await fetch(`${BASE}/api/proposals?limit=50`, {
    headers: { Cookie: Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ') },
  });
  const listData = await list.json();
  const items = listData?.data?.proposals || listData?.data || [];
  const p = items.find((x) => x.reference === REF) || items[0];
  if (!p) throw new Error('No proposal');
  const detail = await fetch(`${BASE}/api/proposals/${p.id}`, {
    headers: { Cookie: Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ') },
  });
  const detailData = await detail.json();
  const full = detailData?.data || detailData;
  console.log(JSON.stringify({
    reference: full.reference,
    id: full.id,
    status: full.status,
    shareToken: full.shareToken,
    total: full.total,
    viewUrl: full.shareToken ? `https://capstonesoftware.co.uk/engage/proposals/view/${full.shareToken}` : null,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });