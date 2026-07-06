import LegalPageLayout from '../../components/legal/LegalPageLayout';

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="1 July 2026">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Agreement</h2>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Engage by
          Capstone (&ldquo;Engage&rdquo;, &ldquo;the Service&rdquo;), operated by Capstone Software
          Ltd (&ldquo;Capstone&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By registering for or
          using Engage, you agree to these Terms on behalf of your accountancy practice
          (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;).
        </p>
        <p>
          If you do not agree, you must not use the Service. Where you accept on behalf of a firm,
          you confirm that you have authority to bind that firm.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. The Service</h2>
        <p>
          Engage is a cloud software platform designed for UK accountancy and bookkeeping practices
          to create, manage, and send client proposals and engagement letters. Features may include
          client management, proposal templates, e-signature collection, MTD ITSA-related tooling,
          and optional AI-assisted drafting via Clara, our in-product assistant.
        </p>
        <p>
          We may update features from time to time. We will use reasonable efforts to avoid material
          disruption, but we do not guarantee uninterrupted availability.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          3. Accounts and eligibility
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>You must provide accurate registration details and keep credentials secure.</li>
          <li>You are responsible for all activity under your tenant account and user logins.</li>
          <li>
            The Service is intended for regulated and professional firms serving UK clients unless
            otherwise agreed in writing.
          </li>
          <li>
            You must comply with applicable laws, including AML, data protection, and professional
            body requirements.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          4. Subscriptions and trials
        </h2>
        <p>
          Paid plans and free trials are offered as described at sign-up or on our pricing page.
          Unless stated otherwise, trials convert to paid subscriptions at the end of the trial
          period if a payment method is on file, or access may be restricted until you subscribe.
        </p>
        <p>
          Fees are billed in advance via Revolut (primary) or legacy Stripe where applicable. You
          authorise us to charge applicable subscription fees and taxes. Cancellations take effect
          at the end of the current billing period unless we agree otherwise.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          4a. Client payment collection (optional)
        </h2>
        <p>
          If you opt in to <strong>Receive Payments Through Engage</strong>, additional{' '}
          <a href="/legal/payment-collection-terms" className="text-primary-600 hover:underline">
            Payment Collection Terms
          </a>{' '}
          apply. Client-facing{' '}
          <a
            href="/legal/client-payment-authorisation"
            className="text-primary-600 hover:underline"
          >
            payment authorisation
          </a>{' '}
          is presented at checkout. Capstone collects client fees via Revolut, deducts disclosed
          fees, and pays the net amount to your nominated account.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          5. Your content and client data
        </h2>
        <p>
          You retain ownership of proposals, templates, client records, and other content you upload
          or create (&ldquo;Customer Content&rdquo;). You grant Capstone a limited licence to host,
          process, and transmit Customer Content solely to provide and improve the Service.
        </p>
        <p>
          You are solely responsible for the accuracy, legality, and professional suitability of
          proposals, engagement letters, fee disclosures, and client communications sent using
          Engage. Clara and other automation features provide drafts and suggestions only — you must
          review and approve all client-facing material before sending.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">6. Acceptable use</h2>
        <p>You must not:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            use the Service unlawfully or to send misleading, defamatory, or unsolicited
            communications;
          </li>
          <li>attempt to access another tenant&apos;s data or circumvent security controls;</li>
          <li>
            reverse engineer, resell, or sublicense the Service except as permitted in writing;
          </li>
          <li>introduce malware or interfere with platform stability.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          7. Confidentiality and security
        </h2>
        <p>
          We implement appropriate technical and organisational measures to protect Customer
          Content. Details are set out in our Privacy Policy. You must configure user permissions
          appropriately and notify us promptly of any suspected unauthorised access.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          8. Intellectual property
        </h2>
        <p>
          Capstone owns the Service, software, branding, and documentation. These Terms do not
          transfer any intellectual property rights to you except the limited right to use the
          Service during your subscription.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          9. Warranties and liability
        </h2>
        <p>
          The Service is provided on an &ldquo;as is&rdquo; basis to the extent permitted by law. We
          do not warrant that Engage will meet every regulatory or professional requirement of your
          firm without your own review and configuration.
        </p>
        <p>
          Nothing in these Terms excludes liability for death or personal injury caused by
          negligence, fraud, or any liability that cannot be excluded under English law. Subject to
          that, our aggregate liability arising from or related to the Service in any twelve-month
          period is limited to the fees paid by you in that period, except where a higher limit is
          required by law.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">10. Termination</h2>
        <p>
          You may cancel your subscription in accordance with your plan. We may suspend or terminate
          access if you materially breach these Terms, fail to pay fees, or if continued provision
          would create legal or security risk. Upon termination, you may export your data within a
          reasonable period where technically feasible.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">11. Governing law</h2>
        <p>
          These Terms are governed by the laws of England and Wales. The courts of England and Wales
          have exclusive jurisdiction, without prejudice to mandatory consumer protections where
          applicable.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">12. Contact</h2>
        <p>
          Questions about these Terms:{' '}
          <a
            href="mailto:legal@capstone.co.uk"
            className="text-primary-600 hover:underline dark:text-primary-400"
          >
            legal@capstone.co.uk
          </a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
