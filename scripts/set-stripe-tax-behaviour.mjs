/**
 * Audit (and optionally fix) the tax_behaviour of Engage's platform-plan
 * Stripe Prices, so Stripe Tax (automatic_tax) can add UK VAT on top of a net
 * price. A Price's tax_behaviour is immutable, so "fixing" a wrong/unset one
 * means creating a NEW Price (Exclusive) — the script prints the new id and the
 * env var to repoint, then you redeploy.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/set-stripe-tax-behaviour.mjs           # audit only (safe)
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/set-stripe-tax-behaviour.mjs --apply   # create Exclusive prices for the flagged ones
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/set-stripe-tax-behaviour.mjs --apply --yes-live
 *
 * Reads the plan price ids from the same env vars the app uses.
 */
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error('✗ STRIPE_SECRET_KEY is not set. Export a test key first.');
  process.exit(1);
}
const LIVE = KEY.startsWith('sk_live_');
const APPLY = process.argv.includes('--apply');
const YES_LIVE = process.argv.includes('--yes-live');

if (APPLY && LIVE && !YES_LIVE) {
  console.error('✗ Refusing to create prices on a LIVE account without --yes-live.');
  process.exit(1);
}

const ENV_VARS = [
  'STRIPE_STARTER_PRICE_ID',
  'STRIPE_STARTER_ANNUAL_PRICE_ID',
  'STRIPE_PROFESSIONAL_PRICE_ID',
  'STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID',
  'STRIPE_ENTERPRISE_PRICE_ID',
  'STRIPE_ENTERPRISE_ANNUAL_PRICE_ID',
];

async function stripe(path, method = 'GET', body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${json.error?.message || JSON.stringify(json)}`);
  return json;
}

console.log(
  `Mode: ${LIVE ? 'LIVE' : 'test'} · ${APPLY ? 'APPLY (will create prices)' : 'audit only'}\n`
);

const fixes = [];
let errors = 0;
let checked = 0;
for (const envVar of ENV_VARS) {
  const id = process.env[envVar];
  if (!id) {
    console.log(`•  ${envVar}: (not set — skipped)`);
    continue;
  }
  let price;
  try {
    price = await stripe(`prices/${id}`);
  } catch (e) {
    console.log(`✗  ${envVar}=${id}: ${e.message}`);
    errors++;
    continue;
  }
  const amount = price.unit_amount != null ? `£${(price.unit_amount / 100).toFixed(2)}` : '(n/a)';
  const interval = price.recurring?.interval || 'one-off';
  const tb = price.tax_behavior; // 'exclusive' | 'inclusive' | 'unspecified'
  const ok = tb === 'exclusive';
  checked++;
  console.log(`${ok ? '✓' : '✗'}  ${envVar}=${id}  ${amount}/${interval}  tax_behavior=${tb}`);
  if (!ok) fixes.push({ envVar, price });
}

if (errors > 0) {
  console.error(`\n✗ ${errors} price(s) could not be checked (see above) — nothing was verified. Fix the key/ID/mode and re-run.`);
  process.exit(1);
}
if (checked === 0) {
  console.error('\n✗ No price IDs were set — nothing checked.');
  process.exit(1);
}
if (fixes.length === 0) {
  console.log(`\n✓ All ${checked} checked price(s) are tax_behavior=exclusive. Nothing to fix.`);
  process.exit(0);
}

console.log(`\n${fixes.length} price(s) need an Exclusive replacement.`);
if (!APPLY) {
  console.log(
    'Re-run with --apply to create them. (Existing prices are never modified or deleted.)'
  );
  process.exit(0);
}

console.log('\nCreating Exclusive replacements:\n');
const updates = [];
for (const { envVar, price } of fixes) {
  const body = {
    product: typeof price.product === 'string' ? price.product : price.product.id,
    currency: price.currency,
    unit_amount: String(price.unit_amount),
    tax_behavior: 'exclusive',
    nickname: `${price.nickname || envVar} (VAT-exclusive)`,
  };
  if (price.recurring) {
    body['recurring[interval]'] = price.recurring.interval;
    if (price.recurring.interval_count)
      body['recurring[interval_count]'] = String(price.recurring.interval_count);
  }
  const created = await stripe('prices', 'POST', body);
  updates.push(`${envVar}=${created.id}`);
  console.log(`  ${envVar}: ${price.id} → ${created.id}`);
}

console.log('\nUpdate these env vars on Render, then redeploy:\n');
console.log(updates.join('\n'));
