import LegalPageLayout from '../../components/legal/LegalPageLayout';

const SUBPROCESSORS = [
  {
    name: 'Render',
    purpose: 'Application hosting (API and static frontend)',
    location: 'EU / US',
    data: 'Application data at rest; logs',
  },
  {
    name: 'Neon / PostgreSQL',
    purpose: 'Primary database',
    location: 'EU',
    data: 'Tenant, client, proposal, and user records',
  },
  {
    name: 'Cloudflare',
    purpose: 'CDN, WAF, Email Service, Workers proxy',
    location: 'Global',
    data: 'HTTP metadata, transactional email content',
  },
  {
    name: 'xAI (Grok)',
    purpose: 'Clara AI proposal assistance',
    location: 'US',
    data: 'Prompts derived from client/proposal context (no card data)',
  },
  {
    name: 'Companies House API',
    purpose: 'UK company lookup and enrichment',
    location: 'UK',
    data: 'Company number queries',
  },
  {
    name: 'Stripe',
    purpose: 'Subscription billing (practice accounts)',
    location: 'EU / US',
    data: 'Billing contact and payment metadata',
  },
  {
    name: 'Revolut',
    purpose: 'Client proposal payments (when enabled)',
    location: 'EU / UK',
    data: 'Payment session metadata',
  },
  {
    name: 'SmartSearch / Creditsafe',
    purpose: 'AML identity checks (when configured)',
    location: 'UK / EU',
    data: 'Client identity verification payloads',
  },
];

export default function Subprocessors() {
  return (
    <LegalPageLayout title="Subprocessors" lastUpdated="3 July 2026">
      <section className="space-y-4">
        <p>
          Engage by Capstone uses the following subprocessors to deliver the service. We maintain
          data processing agreements where required and review subprocessors as part of our SOC 2
          control programme.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          For a signed DPA or subprocessor notification, contact your account representative.
        </p>
      </section>

      <section className="mt-8 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
              <th className="py-2 pr-4 font-semibold">Provider</th>
              <th className="py-2 pr-4 font-semibold">Purpose</th>
              <th className="py-2 pr-4 font-semibold">Region</th>
              <th className="py-2 font-semibold">Data processed</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((row) => (
              <tr key={row.name} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">{row.name}</td>
                <td className="py-3 pr-4">{row.purpose}</td>
                <td className="py-3 pr-4">{row.location}</td>
                <td className="py-3">{row.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </LegalPageLayout>
  );
}