/**
 * Sign a proposal and test post-sign payment setup on production.
 * Usage: node scripts/sign-and-test-payment.mjs <shareToken>
 */
const BASE = 'https://engage-backend-e1ue.onrender.com';
const TOKEN = process.argv[2] || '6c50a876f7ba4e7da327ffdf335993a9';

const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const sign = await fetch(`${BASE}/api/proposals/view/${TOKEN}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedBy: 'William Massey',
      signedByRole: 'Director',
      signerEmail: 'william@capstonesoftware.co.uk',
      signatureData: SIGNATURE,
      agreementAccepted: true,
      authorisedToSign: true,
      consentText: 'I confirm I am authorised to sign and agree to the terms.',
      deviceInfo: JSON.stringify({ platform: 'test-script' }),
    }),
  });
  const signData = await sign.json();
  console.log('Sign:', sign.status, JSON.stringify(signData, null, 2));
  if (!sign.ok) process.exit(1);

  const setup = await fetch(`${BASE}/api/proposals/view/${TOKEN}/payment/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferredMethod: 'card' }),
  });
  const setupData = await setup.json();
  console.log('Payment setup:', setup.status, JSON.stringify(setupData, null, 2));

  const provider = setupData?.data?.provider;
  if (provider === 'revolut' && setupData?.data?.token) {
    console.log('PASS: Revolut configured — checkout token issued');
  } else if (setupData?.data?.isStub) {
    console.log('PASS: Demo stub flow (Revolut env vars not on Render yet)');
  } else {
    console.log('FAIL: unexpected payment setup response');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
