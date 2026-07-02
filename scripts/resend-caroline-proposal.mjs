/**
 * Clone Caroline's Fortis proposal and resend to Capstone Software.
 */
const BASE = 'https://engage-backend-e1ue.onrender.com';
const SOURCE_REF = process.env.SOURCE_REF || 'PROP-MR3G59JO-XO6';

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

  const listRes = await api('/api/proposals?limit=50', { cookies });
  const items = listRes.data?.data?.proposals || listRes.data?.data || [];
  const source = items.find((p) => p.reference === SOURCE_REF) || items[0];
  if (!source?.id) throw new Error('No source proposal found');

  const detail = await api(`/api/proposals/${source.id}`, { cookies });
  if (detail.status !== 200) throw new Error('Failed to load proposal: ' + JSON.stringify(detail.data));
  const full = detail.data?.data || detail.data;

  const services = (full.services || [])
    .filter((s) => s.serviceTemplateId || s.serviceTemplate?.id)
    .map((s) => ({
      serviceId: s.serviceTemplateId || s.serviceTemplate.id,
      quantity: s.quantity || 1,
      billingFrequency: s.billingFrequency || s.frequency || 'MONTHLY',
    }));

  if (!services.length) throw new Error('Source proposal has no catalogue services to clone');

  const create = await api('/api/proposals', {
    method: 'POST',
    cookies,
    csrf,
    body: {
      clientId: full.clientId || full.client?.id,
      title: full.title || 'Fortis Proposal',
      coverLetter: full.coverLetter,
      proposalSummary: full.proposalSummary,
      paymentTerms: full.paymentTerms,
      paymentFrequency: full.paymentFrequency || 'MONTHLY',
      validUntil: full.validUntil?.slice?.(0, 10) || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      services,
    },
  });
  if (create.status !== 201 && create.status !== 200) {
    throw new Error('Create failed: ' + JSON.stringify(create.data));
  }

  const proposal = create.data?.data?.proposal || create.data?.data;
  console.log('Created', proposal.reference, proposal.id);

  const emailDraft = await api('/api/ai/proposal-email-draft', {
    method: 'POST',
    cookies,
    csrf,
    body: { proposalId: proposal.id },
  });
  if (emailDraft.status !== 200) throw new Error('Email draft failed: ' + JSON.stringify(emailDraft.data));

  const { subject, textBody, htmlBody } = emailDraft.data.data;
  const send = await api(`/api/proposals/${proposal.id}/send`, {
    method: 'POST',
    cookies,
    csrf,
    body: { aiSubject: subject, aiText: textBody, aiHtml: htmlBody },
  });
  console.log('Send', send.status, send.data?.data?.reference, send.data?.error || send.data?.message);
  if (send.status !== 200) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});