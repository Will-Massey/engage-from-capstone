import LegalPageLayout from '../../components/legal/LegalPageLayout';
import { AI_COPILOT } from '../../config/aiCopilot';

export default function AiDisclosure() {
  return (
    <LegalPageLayout title="AI Disclosure" lastUpdated="1 July 2026">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Purpose</h2>
        <p>
          This disclosure explains how {AI_COPILOT.name}, the Engage proposal assistant, uses artificial
          intelligence (&ldquo;AI&rdquo;) within Engage by Capstone. It is provided to help UK accountancy
          practices meet transparency expectations with staff and clients.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. What {AI_COPILOT.name} does</h2>
        <p>
          {AI_COPILOT.name} assists your team inside Engage. Depending on your configuration, it may help with:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>suggesting services and fee narratives for a client context;</li>
          <li>drafting proposal titles, cover letters, and client email wording;</li>
          <li>summarising Companies House or practice-held context to speed up proposal creation;</li>
          <li>pre-send review checklists and follow-up suggestions on saved proposals;</li>
          <li>answering client questions on the public proposal page (where enabled).</li>
        </ul>
        <p>
          {AI_COPILOT.name} does <strong>not</strong> send proposals, emails, or engagement letters without a
          human review step in your workflow. You remain professionally responsible for all client-facing content.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. Human oversight</h2>
        <p>
          AI outputs are suggestions only. Your users must review, edit, and approve drafts before anything is
          sent to a client. We recommend treating {AI_COPILOT.name} as a junior draftsperson: fast and helpful,
          but never a substitute for partner sign-off on regulated advice, fee disclosures, or engagement terms.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. Data sent to AI services</h2>
        <p>When you invoke {AI_COPILOT.name}, Engage may transmit relevant context to our AI provider, such as:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>client name, company type, and publicly available company data you have linked;</li>
          <li>proposal title, services, prices, and draft cover letter text;</li>
          <li>limited practice metadata (e.g. practice name) needed to personalise drafts;</li>
          <li>user prompts and conversation history within the assistant panel.</li>
        </ul>
        <p>
          We do not intentionally send full payment card data to AI providers. Prompts are processed to generate
          responses; retention by sub-processors is limited to what is necessary to operate the service and is
          governed by our data processing arrangements.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. Accuracy and limitations</h2>
        <p>
          AI models can produce plausible but incorrect text — including wrong fee figures, outdated regulatory
          references, or inappropriate tone. Always verify services, VAT treatment, MTD ITSA statements, and
          engagement terms against your own templates and professional judgement.
        </p>
        <p>
          {AI_COPILOT.name} must not be relied upon for legal, tax, or investment advice. It summarises and drafts;
          it does not replace qualified professional advice to your clients.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">6. Client-facing AI</h2>
        <p>
          Where the public proposal Q&amp;A feature is enabled, clients may ask questions about the proposal they
          are viewing. Responses are constrained to the proposal content provided and must not invent fees or
          terms. You may disable or limit AI features in settings if they are not appropriate for your firm or
          client segment.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">7. Cost and usage controls</h2>
        <p>
          Your practice administrator can control whether AI is enabled. Engage applies usage budgeting and logging
          to help prevent runaway token consumption. Background automation that calls AI without user action is
          minimised by design; most AI features are user-triggered.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">8. Your responsibilities</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Ensure client privacy notices cover use of cloud processors and AI where required.</li>
          <li>Train staff not to paste unnecessary special-category or sensitive data into prompts.</li>
          <li>Maintain review and approval workflows before sending client communications.</li>
          <li>Contact us if you need a data processing addendum covering AI sub-processors.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">9. Contact</h2>
        <p>
          Questions about AI in Engage:{' '}
          <a href="mailto:privacy@capstone.co.uk" className="text-primary-600 hover:underline dark:text-primary-400">
            privacy@capstone.co.uk
          </a>
        </p>
      </section>
    </LegalPageLayout>
  );
}