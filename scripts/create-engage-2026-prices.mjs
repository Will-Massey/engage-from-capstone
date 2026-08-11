/**
 * Create the Solo £29 / Practice £59 Stripe Prices to match SUBSCRIPTION_TIERS.
 *
 * A Price's unit_amount is immutable, so repricing means creating NEW Prices and
 * repointing the env vars. The existing £49/£99 Prices are never modified or
 * deleted — they stay active so anything already referencing them keeps working.
 *
 * tax_behavior is forced to 'exclusive' on every Price created here: with the
 * account default (inferred_by_currency) GBP infers INCLUSIVE, which would mean
 * absorbing the VAT out of £29 instead of adding it on top. That is the exact
 * defect found on 2026-07-17.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/create-engage-2026-prices.mjs            # dry run
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/create-engage-2026-prices.mjs --apply --yes-live
 *
 * Enterprise is untouched — £249 / £2,539.80 already match the code.
 */
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error('✗ STRIPE_SECRET_KEY is not set.');
  process.exit(1);
}
const LIVE = KEY.startsWith('sk_live_');
const APPLY = process.argv.includes('--apply');
const YES_LIVE = process.argv.includes('--yes-live');

if (APPLY && LIVE && !YES_LIVE) {
  console.error('✗ Refusing to create prices on a LIVE account without --yes-live.');
  process.exit(1);
}

// Amounts in pence, mirroring backend/src/config/stripe.ts (15% annual discount).
const PLANS = [
  {
    envVar: 'STRIPE_STARTER_PRICE_ID',
    product: 'prod_Us7TjSenxfqbup', // Engage Starter
    nickname: 'Engage Solo monthly £29 (VAT-exclusive)',
    unit_amount: 2900,
    interval: 'month',
  },
  {
    envVar: 'STRIPE_STARTER_ANNUAL_PRICE_ID',
    product: 'prod_Us7TjSenxfqbup',
    nickname: 'Engage Solo annual £295.80 (−15%) (VAT-exclusive)',
    unit_amount: 29580,
    interval: 'year',
  },
  {
    envVar: 'STRIPE_PROFESSIONAL_PRICE_ID',
    product: 'prod_Us7U5tb4xYvrHB', // Engage Professional
    nickname: 'Engage Practice monthly £59 (VAT-exclusive)',
    unit_amount: 5900,
    interval: 'month',
  },
  {
    envVar: 'STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID',
    product: 'prod_Us7U5tb4xYvrHB',
    nickname: 'Engage Practice annual £601.80 (−15%) (VAT-exclusive)',
    unit_amount: 60180,
    interval: 'year',
  },
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

const gbp = (pence) => `£${(pence / 100).toFixed(2)}`;

console.log(`Mode: ${LIVE ? 'LIVE' : 'test'} · ${APPLY ? 'APPLY' : 'dry run'}\n`);

// Confirm the products exist and are the ones we mean, before creating anything.
for (const productId of [...new Set(PLANS.map((p) => p.product))]) {
  const product = await stripe(`products/${productId}`);
  console.log(`product ${productId} → "${product.name}"${product.active ? '' : ' (INACTIVE)'}`);
}
console.log();

if (!APPLY) {
  for (const plan of PLANS) {
    console.log(`would create  ${gbp(plan.unit_amount)}/${plan.interval}  → ${plan.envVar}`);
  }
  console.log('\nRe-run with --apply (and --yes-live for a live key) to create them.');
  process.exit(0);
}

const created = [];
for (const plan of PLANS) {
  const price = await stripe('prices', 'POST', {
    product: plan.product,
    currency: 'gbp',
    unit_amount: String(plan.unit_amount),
    tax_behavior: 'exclusive',
    nickname: plan.nickname,
    'recurring[interval]': plan.interval,
    'metadata[app]': 'engage',
  });

  // Read back rather than trusting the create response.
  const check = await stripe(`prices/${price.id}`);
  const ok =
    check.unit_amount === plan.unit_amount &&
    check.tax_behavior === 'exclusive' &&
    check.recurring?.interval === plan.interval &&
    check.currency === 'gbp';
  if (!ok) {
    throw new Error(
      `✗ ${price.id} did not read back as expected: ${gbp(check.unit_amount)}/${check.recurring?.interval} ${check.tax_behavior} ${check.currency}`
    );
  }
  console.log(`✓ ${price.id}  ${gbp(check.unit_amount)}/${check.recurring.interval}  exclusive`);
  created.push({ envVar: plan.envVar, id: price.id });
}

console.log('\nRepoint these on the engage-backend Render service, then redeploy:\n');
for (const { envVar, id } of created) console.log(`  ${envVar}=${id}`);
console.log(
  '\nUse scripts/render-env-guard.ps1 → Set-RenderEnvVarsSafe. Never a naive PUT: it is a\n' +
    'full replacement, and that is what wiped all 68 env vars on 2026-08-10.'
);
