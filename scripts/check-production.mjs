/**
 * Smoke-check production (or override URLs via env).
 * Usage: npm run check:production
 *
 * Env:
 *   PRODUCTION_API_URL  (default: Render backend from blueprint)
 *   PRODUCTION_APP_URL  (default: Render static frontend)
 */
const BACKEND = process.env.PRODUCTION_API_URL || 'https://engage-backend-e1ue.onrender.com';
const FRONTEND = process.env.PRODUCTION_APP_URL || 'https://engage-frontend-0g6u.onrender.com';

async function check(url, label) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    clearTimeout(t);
    const ok = r.ok || r.status === 304;
    console.log(`${label}: HTTP ${r.status} ${ok ? '✓' : '✗'}`);
    if (!ok) process.exitCode = 1;
  } catch (e) {
    clearTimeout(t);
    console.error(`${label}: FAIL —`, e?.cause?.message || e.message);
    process.exitCode = 1;
  }
}

console.log('Production checks (override with PRODUCTION_API_URL / PRODUCTION_APP_URL)\n');
await check(`${BACKEND.replace(/\/$/, '')}/ping`, 'Backend /ping');
await check(`${FRONTEND.replace(/\/$/, '')}/`, 'Frontend /');
process.exit(process.exitCode ?? 0);
