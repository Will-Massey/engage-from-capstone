import LegalPageLayout from '../../components/legal/LegalPageLayout';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="1 July 2026">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Who we are</h2>
        <p>
          Capstone Software Ltd (&ldquo;Capstone&rdquo;, &ldquo;we&rdquo;) provides Engage by
          Capstone, a proposal and client engagement platform for UK accountancy practices. We act
          as a data processor when handling personal data on your behalf as a customer, and as a
          data controller for account, billing, and platform administration data.
        </p>
        <p>
          Contact:{' '}
          <a
            href="mailto:privacy@capstone.co.uk"
            className="text-primary-600 hover:underline dark:text-primary-400"
          >
            privacy@capstone.co.uk
          </a>
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. Data we process</h2>
        <p>Depending on how you use Engage, we may process:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Practice account data</strong> — firm name, subdomain, user names, email
            addresses, roles, authentication logs, and security settings (including MFA).
          </li>
          <li>
            <strong>Client and proposal data</strong> — client names, contact details, company
            information, proposal content, signatures, audit trails, and communications you send via
            the platform.
          </li>
          <li>
            <strong>Billing data</strong> — subscription status and payment references processed by
            Stripe (we do not store full card numbers).
          </li>
          <li>
            <strong>Technical data</strong> — IP addresses, device/browser information, and usage
            logs for security and reliability.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. Lawful bases</h2>
        <p>We rely on the following UK GDPR lawful bases:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Contract</strong> — to provide Engage, authenticate users, and deliver features
            you subscribe to.
          </li>
          <li>
            <strong>Legitimate interests</strong> — to secure the platform, prevent abuse, improve
            reliability, and support customers (balanced against your rights).
          </li>
          <li>
            <strong>Legal obligation</strong> — where we must retain records for tax, accounting, or
            regulatory purposes.
          </li>
          <li>
            <strong>Consent</strong> — where required for optional marketing or non-essential
            cookies (where applicable).
          </li>
        </ul>
        <p>
          For client personal data entered by your practice, you are responsible for identifying and
          documenting your own lawful basis and providing appropriate privacy notices to your
          clients.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. How we use data</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>operate, maintain, and improve Engage;</li>
          <li>
            send transactional emails (e.g. proposal delivery, password reset, security alerts);
          </li>
          <li>provide support and investigate incidents;</li>
          <li>process subscription payments via Stripe;</li>
          <li>generate aggregated, non-identifying analytics to improve the product.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. Sub-processors</h2>
        <p>
          We use carefully selected providers to host and operate Engage. Typical categories include
          cloud hosting, database infrastructure, email delivery, payment processing, and (where
          enabled) AI inference providers used to power Clara. A current sub-processor list is
          available on request and will be maintained for enterprise customers under data processing
          terms.
        </p>
        <p>
          Key providers may include Render, Neon, Cloudflare (hosting and email), Stripe, and xAI
          (for AI features).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          6. International transfers
        </h2>
        <p>
          Where personal data is transferred outside the UK, we implement appropriate safeguards
          such as the UK International Data Transfer Agreement or equivalent mechanisms, and we
          assess transfer risk in line with ICO guidance.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">7. Retention</h2>
        <p>
          We retain account and billing records for as long as your subscription is active and for a
          reasonable period afterwards for legal, tax, and dispute resolution purposes. Proposal and
          signature audit data may be retained longer where required for evidential integrity. You
          may request deletion or export subject to legal and contractual constraints.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">8. Security</h2>
        <p>
          We apply encryption in transit, access controls, tenant isolation, audit logging, and
          regular patching. No online service can be guaranteed completely secure; please use strong
          passwords, enable MFA, and restrict user roles within your practice.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">9. Your rights</h2>
        <p>
          Under UK data protection law you may have rights to access, rectify, erase, restrict,
          object, and port certain personal data, and to withdraw consent where processing is
          consent-based. You may also lodge a complaint with the Information Commissioner&apos;s
          Office (ICO).
        </p>
        <p>
          Practice users should direct client rights requests to their own firm in the first
          instance; we will assist you as processor where applicable.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">10. Changes</h2>
        <p>
          We may update this policy to reflect legal or product changes. Material updates will be
          communicated via the Service or email where appropriate.
        </p>
      </section>
    </LegalPageLayout>
  );
}
