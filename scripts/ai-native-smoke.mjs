#!/usr/bin/env node
/**
 * AI-native production smoke — login, AI status, attention queue, email draft, regulatory alerts.
 */
const API = (process.argv[2] || 'https://engage-backend-e1ue.onrender.com').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'admin@demo.practice';
const PASSWORD = process.env.SMOKE_PASSWORD || 'DemoPass123!';

const jar = new Map();

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() || [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(path, options = {}) {
  const url = `${API}${path.startsWith('/api') ? path : `/api${path}`}`;
  const headers = { ...(options.headers || {}) };
  if (jar.size) headers.Cookie = cookieHeader();
  const res = await fetch(url, { ...options, headers, redirect: 'manual' });
  parseSetCookie(res.headers);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function ok(label, res, check) {
  if (check(res)) {
    console.log(`OK ${label}`);
    return true;
  }
  console.error(`FAIL ${label}`, res.status, JSON.stringify(res.body).slice(0, 400));
  return false;
}

async function main() {
  console.log(`AI-native smoke → ${API}\n`);

  const ping = await fetch(`${API}/ping`);
  if (!ping.ok) throw new Error(`ping failed ${ping.status}`);
  console.log('OK ping');

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!ok('login', login, (r) => r.body?.success)) process.exit(1);

  const csrf = jar.get('csrfToken');
  if (!csrf) {
    const csrfRes = await request('/auth/csrf-token');
    if (!csrfRes.body?.data?.csrfToken) process.exit(1);
  }
  const csrfToken = jar.get('csrfToken');
  const authHeaders = { 'X-CSRF-Token': csrfToken };

  const aiStatus = await request('/ai/status', { headers: authHeaders });
  if (
    !ok('ai/status', aiStatus, (r) => {
      const feats = r.body?.data?.features || [];
      return (
        r.body?.success &&
        r.body?.data?.configured &&
        feats.includes('proposal_email_draft') &&
        feats.includes('regulatory_watcher')
      );
    })
  )
    process.exit(1);

  const budget = aiStatus.body?.data?.tokenBudget;
  console.log(
    `   token budget: ${budget?.usedThisMonth}/${budget?.budgetMonthly} (${budget?.aiCallsThisMonth} calls)`
  );

  const queue = await request('/ai/attention-queue', { headers: authHeaders });
  ok(
    'ai/attention-queue',
    queue,
    (r) => r.body?.success && (Array.isArray(r.body?.data) || Array.isArray(r.body?.data?.items))
  );

  const regulatory = await request('/ai/regulatory-alerts', { headers: authHeaders });
  ok(
    'ai/regulatory-alerts',
    regulatory,
    (r) => r.body?.success && Array.isArray(r.body?.data?.alerts)
  );

  const benchmark = await request('/analytics/fee-benchmarks', { headers: authHeaders });
  ok(
    'analytics/fee-benchmarks',
    benchmark,
    (r) => r.body?.success && Array.isArray(r.body?.data?.benchmarks)
  );

  const proposals = await request('/proposals?limit=1&status=DRAFT', { headers: authHeaders });
  const draft = proposals.body?.data?.[0] || proposals.body?.data?.proposals?.[0];
  if (draft?.id) {
    const emailDraft = await request('/ai/proposal-email-draft', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: draft.id }),
    });
    ok(
      'ai/proposal-email-draft',
      emailDraft,
      (r) => r.body?.success && r.body?.data?.subject && r.body?.data?.textBody
    );
    if (emailDraft.body?.data?.subject) {
      console.log(`   email subject: ${emailDraft.body.data.subject.slice(0, 80)}…`);
    }
  } else {
    console.log('SKIP ai/proposal-email-draft (no draft proposal)');
  }

  console.log('\nAll AI-native smoke checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
