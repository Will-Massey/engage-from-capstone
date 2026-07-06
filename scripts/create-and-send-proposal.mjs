/**
 * Create a draft proposal for William and send via Engage API
 */
const BASE = 'https://engage-backend-e1ue.onrender.com';
const TARGET_EMAIL = 'william@capstonesoftware.co.uk';

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
    body: { email: 'admin@demo.practice', password: 'DemoPass123!' },
    cookies,
  });
  cookies = login.cookies;
  const csrf = cookies.csrfToken;
  if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.data));

  const clients = await api('/api/clients?limit=50', { cookies });
  const clientList = Array.isArray(clients.data?.data) ? clients.data.data : [];
  let client = clientList.find((c) => c.contactEmail?.toLowerCase() === TARGET_EMAIL.toLowerCase());
  if (!client) {
    client = clientList[0];
    if (client) {
      await api(`/api/clients/${client.id}`, {
        method: 'PUT',
        cookies,
        csrf,
        body: { contactEmail: TARGET_EMAIL },
      });
      console.log('Updated client email to', TARGET_EMAIL);
    }
  }
  if (!client) throw new Error('No clients found');

  const services = await api('/api/services?limit=5', { cookies });
  const svcList = Array.isArray(services.data?.data) ? services.data.data : [];
  const svc = svcList[0] || null;
  if (!svc) throw new Error('No services in catalog');

  const create = await api('/api/proposals', {
    method: 'POST',
    cookies,
    csrf,
    body: {
      clientId: client.id,
      title: 'Commercial readiness test proposal',
      services: [{ serviceId: svc.id, quantity: 1, billingFrequency: 'MONTHLY' }],
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
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
  if (emailDraft.status !== 200 || !emailDraft.data?.data?.subject) {
    throw new Error('AI email draft failed: ' + JSON.stringify(emailDraft.data));
  }
  const { subject, textBody, htmlBody } = emailDraft.data.data;
  console.log('Clara email subject:', subject);

  const send = await api(`/api/proposals/${proposal.id}/send`, {
    method: 'POST',
    cookies,
    csrf,
    body: { aiSubject: subject, aiText: textBody, aiHtml: htmlBody },
  });
  console.log('Send', send.status, JSON.stringify(send.data));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
