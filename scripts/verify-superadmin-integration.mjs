/**
 * Verify Engage ↔ Capstone Superadmin integration (6 checks).
 * Usage: node scripts/verify-superadmin-integration.mjs
 *
 * Env (or capstone-superadmin/scripts/engage-env.json):
 *   SUPERADMIN_URL, SUPERADMIN_WEBHOOK_SECRET, SUPERADMIN_API_KEY
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGAGE_HEALTH = process.env.ENGAGE_HEALTH_URL || 'https://capstonesoftware.co.uk/engage/ping';

function loadEngageEnv() {
  const jsonPath = path.resolve(__dirname, '../../capstone-superadmin/scripts/engage-env.json');
  if (!existsSync(jsonPath)) return {};
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    const start = raw.indexOf('{');
    if (start < 0) return {};
    const parsed = JSON.parse(raw.slice(start));
    return parsed.engage || {};
  } catch {
    return {};
  }
}

const fileEnv = loadEngageEnv();
const SUPERADMIN_URL = (process.env.SUPERADMIN_URL || fileEnv.SUPERADMIN_URL || '').replace(
  /\/$/,
  ''
);
const WEBHOOK_SECRET = process.env.SUPERADMIN_WEBHOOK_SECRET || fileEnv.SUPERADMIN_WEBHOOK_SECRET;
const API_KEY = process.env.SUPERADMIN_API_KEY || fileEnv.SUPERADMIN_API_KEY;

function sign(method, apiPath, timestamp, body = '') {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const bodyHash = createHash('sha256').update(bodyStr).digest('hex');
  const canonical = `${method.toUpperCase()}\n${apiPath}\n${timestamp}\n${bodyHash}`;
  return createHmac('sha256', WEBHOOK_SECRET).update(canonical).digest('hex');
}

async function saRequest(method, apiPath, body, { useApiKey = true } = {}) {
  const timestamp = String(Date.now());
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = {
    'Content-Type': 'application/json',
    'X-Capstone-App-Id': 'engage',
    'X-Capstone-Timestamp': timestamp,
    'X-Capstone-Signature': sign(method, apiPath, timestamp, bodyStr),
  };
  // API key is optional on superadmin ingest; stale keys in engage-env.json cause 401
  if (useApiKey && API_KEY && process.env.SUPERADMIN_USE_API_KEY === '1') {
    headers['X-Capstone-Api-Key'] = API_KEY;
  }

  const res = await fetch(`${SUPERADMIN_URL}${apiPath}`, {
    method,
    headers,
    body: bodyStr || undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data, error: data.error };
}

const checks = [];

async function run() {
  // 1. Registered + credentials
  checks.push({
    id: 'credentials',
    label: 'Superadmin credentials configured',
    ok: Boolean(SUPERADMIN_URL && WEBHOOK_SECRET && API_KEY),
    detail: SUPERADMIN_URL || 'missing SUPERADMIN_URL',
  });

  // 2. Health endpoint
  let healthOk = false;
  try {
    const res = await fetch(ENGAGE_HEALTH, { signal: AbortSignal.timeout(20_000) });
    const body = await res.json().catch(() => ({}));
    healthOk = res.ok && (body.status === 'ok' || body.status === 'healthy');
    checks.push({
      id: 'health',
      label: 'Engage health endpoint',
      ok: healthOk,
      detail: `${ENGAGE_HEALTH} → ${res.status}`,
    });
  } catch (err) {
    checks.push({
      id: 'health',
      label: 'Engage health endpoint',
      ok: false,
      detail: err.message,
    });
  }

  if (!SUPERADMIN_URL || !WEBHOOK_SECRET) {
    printSummary();
    process.exit(1);
  }

  // 3. Tenant sync
  const tenantPayload = {
    tenants: [
      {
        externalTenantId: 'engage-integration-probe',
        name: 'Engage Integration Probe',
        plan: 'trial',
        planStatus: 'trial',
        userCount: 1,
      },
    ],
  };
  const sync = await saRequest('POST', '/api/v1/ingest/tenants', tenantPayload);
  checks.push({
    id: 'tenants',
    label: 'Tenant sync ingest',
    ok: sync.ok,
    detail: sync.ok ? 'POST /api/v1/ingest/tenants 200' : `HTTP ${sync.status}`,
  });

  // 4. Metrics
  const metrics = await saRequest('POST', '/api/v1/ingest/metrics', {
    metrics: [{ metric: 'integration_probe', value: 1, dimensions: { source: 'verify-script' } }],
  });
  checks.push({
    id: 'metrics',
    label: 'Metrics ingest',
    ok: metrics.ok,
    detail: metrics.ok ? 'POST /api/v1/ingest/metrics 200' : `HTTP ${metrics.status}`,
  });

  // 5. Events
  const events = await saRequest('POST', '/api/v1/ingest/events', {
    events: [
      {
        eventType: 'integration_probe',
        payload: { source: 'verify-script', at: new Date().toISOString() },
      },
    ],
  });
  checks.push({
    id: 'events',
    label: 'Event stream ingest',
    ok: events.ok,
    detail: events.ok ? 'POST /api/v1/ingest/events 200' : `HTTP ${events.status}`,
  });

  // 6. Command poll
  const commands = await saRequest('GET', '/api/v1/commands/pending');
  checks.push({
    id: 'commands',
    label: 'Command poll',
    ok: commands.ok,
    detail: commands.ok
      ? `${(commands.data.commands || []).length} pending`
      : `HTTP ${commands.status}`,
  });

  printSummary();
  const failed = checks.filter((c) => !c.ok);
  process.exit(failed.length ? 1 : 0);
}

function printSummary() {
  const passed = checks.filter((c) => c.ok).length;
  console.log('\nEngage Superadmin integration checks\n');
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.label} — ${c.detail}`);
  }
  console.log(`\nScore: ${passed}/${checks.length}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
