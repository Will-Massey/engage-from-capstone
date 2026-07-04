import LegalPageLayout from '../../components/legal/LegalPageLayout';

export default function PaymentCollectionTerms() {
  return (
    <LegalPageLayout title="Payment Collection Terms" lastUpdated="4 July 2026">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Overview</h2>
        <p>
          These Payment Collection Terms (&ldquo;PCT&rdquo;) supplement the Engage Terms of Service and
          apply when your practice enables <strong>Receive Payments Through Engage</strong>. Version{' '}
          <strong>ENGAGE-PCT-2026-001</strong>.
        </p>
        <p>
          Capstone Software Ltd (&ldquo;Capstone&rdquo;, &ldquo;we&rdquo;) collects client payments on your
          behalf via Revolut Merchant Services. We deduct applicable platform and payment processing fees,
          then transfer the net amount to your nominated UK bank account or Revolut counterparty.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. Your role</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>You remain the supplier of accountancy services to your client.</li>
          <li>
            Capstone acts as a commercial collection agent — not as the provider of professional services to
            your client.
          </li>
          <li>
            You are responsible for the accuracy of fees, scope, and client communications in proposals sent
            through Engage.
          </li>
          <li>
            You must only enable payment collection where you are permitted to do so under your professional
            body rules and UK law.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. Fees</h2>
        <p>
          Unless otherwise agreed in writing, Engage deducts a platform fee (typically 2.5% of the gross
          collection; 1.0% on Enterprise plans) plus payment processing costs and a processing service
          margin before payout.
        </p>
        <p>
          Example: on a £100.00 client payment, you may receive approximately £96.00 after fees, depending on
          payment method and your subscription tier. Exact figures are shown in your Engage settings and on
          client checkout screens.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. Payouts</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Payouts are made to the UK bank account or Revolut counterparty you nominate in settings.</li>
          <li>
            First payouts may be held for up to 48 hours while we verify payout destination details.
          </li>
          <li>Card payments are typically paid out promptly after successful collection; timing depends on Revolut settlement.</li>
          <li>We may delay or withhold payouts where fraud, chargeback, or compliance concerns arise.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. Chargebacks and refunds</h2>
        <p>
          If a client payment is reversed, refunded, or charged back, we may recover the amount (including
          fees) from future payouts or invoice your practice directly.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">6. Data protection</h2>
        <p>
          Bank details you provide are encrypted at rest. We do not store card numbers — card data is handled
          by Revolut. See our Privacy Policy for subprocessors and retention.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">7. Termination</h2>
        <p>
          You may disable payment collection at any time in Engage settings. Outstanding collected funds will
          be paid out subject to holds and chargeback windows. Transaction records are retained for at least
          seven years for audit purposes.
        </p>
      </section>
    </LegalPageLayout>
  );
}