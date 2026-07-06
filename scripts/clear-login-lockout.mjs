#!/usr/bin/env node
/**
 * Clear login lockout for a user via setup endpoint or by restarting guidance.
 * Usage: node scripts/clear-login-lockout.mjs [email]
 * Env: API_URL, SETUP_SECRET_KEY (if configured on server)
 */
const API = (process.env.API_URL || 'https://engage-backend-e1ue.onrender.com').replace(/\/$/, '');
const EMAIL = process.argv[2] || process.env.SMOKE_EMAIL || 'admin@demo.practice';
const SETUP_KEY = process.env.SETUP_SECRET_KEY || '';

async function main() {
  if (!SETUP_KEY) {
    console.log(
      'No SETUP_SECRET_KEY — restart the backend service to clear in-memory rate limits.'
    );
    console.log('Render: https://dashboard.render.com/web/srv-d6qkjlua2pns73a2r1fg');
    console.log('Or wait 15–30 minutes for limits to expire.');
    process.exit(0);
  }

  const res = await fetch(`${API}/api/setup/clear-login-lockout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Setup-Key': SETUP_KEY,
    },
    body: JSON.stringify({ email: EMAIL }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(res.status, JSON.stringify(body, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
