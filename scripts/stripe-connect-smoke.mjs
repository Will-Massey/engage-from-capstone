/**
 * Stripe Connect smoke — validates the Accounts v2 recipient payload against the
 * real Stripe API by driving the compiled connect wrapper (backend/dist).
 *
 * Creates a recipient connected account + onboarding link, reads capability status.
 * No money moves. Run after `npm run build` in backend/.
 *
 *   node scripts/stripe-connect-smoke.mjs
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.development' });

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('FAIL: STRIPE_SECRET_KEY not set (.env.local)');
  process.exit(1);
}

const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'TEST';
console.log(`Stripe mode: ${mode}`);

const { createRecipientAccount, createOnboardingLink, getTransfersStatus } = await import(
  '../backend/dist/lib/stripe/connect.js'
);

try {
  const acct = await createRecipientAccount({
    country: 'gb',
    email: 'connect-smoke@capstonesoftware.co.uk',
    businessName: 'Engage Connect Smoke',
  });
  console.log(`PASS createRecipientAccount → ${acct.id}`);

  const link = await createOnboardingLink(
    acct.id,
    'https://capstonesoftware.co.uk/engage/settings?tab=billing&onboarding=complete',
    'https://capstonesoftware.co.uk/engage/settings?tab=billing'
  );
  const okUrl = /connect\.stripe\.com/.test(link.url);
  console.log(`${okUrl ? 'PASS' : 'FAIL'} createOnboardingLink → ${link.url.slice(0, 48)}...`);

  const status = await getTransfersStatus(acct.id);
  console.log(`PASS getTransfersStatus → "${status}" (expect inactive/pending pre-onboarding)`);

  console.log(`\nSMOKE OK. Created account ${acct.id} (${mode}) — archive/reject in Dashboard if unwanted.`);
} catch (err) {
  console.error('FAIL:', err?.message || err);
  if (err?.raw?.message) console.error('stripe:', err.raw.message);
  process.exit(1);
}
