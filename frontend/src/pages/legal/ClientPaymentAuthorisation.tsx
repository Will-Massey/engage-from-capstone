import LegalPageLayout from '../../components/legal/LegalPageLayout';

export default function ClientPaymentAuthorisation() {
  return (
    <LegalPageLayout title="Client Payment Authorisation" lastUpdated="4 July 2026">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Purpose</h2>
        <p>
          This authorisation (&ldquo;CPA&rdquo;) applies when you pay engagement fees through Engage
          after accepting a proposal from your accountant. Version{' '}
          <strong>ENGAGE-CPA-2026-001</strong>.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          2. What you authorise
        </h2>
        <p>By proceeding to payment, you confirm that:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            You authorise payment of the fees shown on the accepted proposal, including any
            recurring charges described in that proposal.
          </li>
          <li>
            Payment is processed securely by Stripe on behalf of Capstone Software Ltd, acting as
            collection agent for <strong>your accountant&apos;s practice</strong>.
          </li>
          <li>
            Capstone deducts platform and payment processing fees before transferring the remainder
            to your accountant. This does not change the total you pay.
          </li>
          <li>You have read and accepted the proposal terms and engagement letter (if shown).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. Card payments</h2>
        <p>
          Card details are entered on Stripe&apos;s secure checkout page. Engage and your accountant
          never see or store your full card number, expiry date, or CVC.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. Recurring fees</h2>
        <p>
          Where your proposal includes monthly, quarterly, or annual recurring fees, you authorise
          your accountant to collect those amounts using the payment method you provide, in line
          with the proposal and engagement terms.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          5. Queries and disputes
        </h2>
        <p>
          Questions about services, fees, or scope should be directed to your accountant in the
          first instance. Payment processing queries may be directed to{' '}
          <a
            href="mailto:support@capstonesoftware.co.uk"
            className="text-primary-600 hover:underline"
          >
            support@capstonesoftware.co.uk
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
