import LegalPageLayout from '../../components/legal/LegalPageLayout';

const CONTROLS = [
  {
    id: 'CC6.1',
    title: 'Logical and physical access',
    status: 'Implemented',
    detail: 'JWT authentication, role-based authorisation, MFA/TOTP, tenant-scoped data access.',
  },
  {
    id: 'CC6.6',
    title: 'System boundaries',
    status: 'Implemented',
    detail:
      'Row-level tenant isolation, CSRF protection, cross-tenant header rejection, upload IDOR fixes.',
  },
  {
    id: 'CC7.2',
    title: 'Security monitoring',
    status: 'Partial',
    detail:
      'Structured application logging; Render log drains and alerting recommended at go-live.',
  },
  {
    id: 'CC8.1',
    title: 'Change management',
    status: 'Implemented',
    detail: 'Prisma migrations in deploy pipeline; production DDL via admin routes disabled.',
  },
  {
    id: 'A1.2',
    title: 'Availability',
    status: 'Partial',
    detail:
      'Public status page at /status; uptime monitoring and backup restore drills pending paid tier.',
  },
  {
    id: 'P1',
    title: 'Privacy & GDPR',
    status: 'Implemented',
    detail:
      'Privacy policy, AI disclosure, consent on e-sign; subject access export path documented.',
  },
];

export default function Soc2Controls() {
  return (
    <LegalPageLayout title="Security & SOC 2 Controls" lastUpdated="1 July 2026">
      <section className="space-y-4">
        <p>
          This page summarises Engage by Capstone controls mapped to SOC 2 Trust Services Criteria.
          It supports enterprise due diligence and aligns with our public{' '}
          <a href="/status" className="text-primary-600 hover:underline dark:text-primary-400">
            system status
          </a>{' '}
          page (W4.5).
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Formal SOC 2 Type II certification is a post-revenue milestone. Controls below reflect the
          current product implementation on the free-tier deployment.
        </p>
      </section>

      <section className="space-y-3 mt-8">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Control inventory</h2>
        <div className="divide-y divide-slate-200 dark:divide-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {CONTROLS.map((c) => (
            <div key={c.id} className="px-4 py-4 bg-white/60 dark:bg-slate-900/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900 dark:text-white">
                  {c.id} — {c.title}
                </p>
                <span
                  className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    c.status === 'Implemented'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{c.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </LegalPageLayout>
  );
}
