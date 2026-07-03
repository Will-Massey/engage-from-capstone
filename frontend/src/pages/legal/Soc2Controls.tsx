import LegalPageLayout from '../../components/legal/LegalPageLayout';

const CONTROLS = [
  {
    id: 'CC6.1',
    title: 'Logical and physical access',
    status: 'Implemented',
    detail:
      'JWT + httpOnly cookies, RBAC, MFA/TOTP for privileged roles (configurable enforcement), 12-character password policy, session list/revoke, login lockout.',
  },
  {
    id: 'CC6.6',
    title: 'System boundaries',
    status: 'Implemented',
    detail:
      'Tenant row isolation, CSRF double-submit, cross-tenant header rejection, signature IDOR fixes, Helmet security headers with HSTS.',
  },
  {
    id: 'CC7.2',
    title: 'Security monitoring',
    status: 'Implemented',
    detail:
      'Structured security event logging (login, MFA, session revoke) to application logs and ActivityLog; public /status page. SIEM integration recommended at go-live.',
  },
  {
    id: 'CC8.1',
    title: 'Change management',
    status: 'Implemented',
    detail:
      'Prisma migrations in deploy pipeline; setup/admin DDL endpoints disabled by default (ENABLE_SETUP_ENDPOINT=false).',
  },
  {
    id: 'A1.2',
    title: 'Availability',
    status: 'Partial',
    detail:
      'Public status page at /status; Render Starter tier and external uptime monitoring recommended for production SLA.',
  },
  {
    id: 'P1',
    title: 'Privacy & GDPR',
    status: 'Implemented',
    detail:
      'Privacy policy, AI disclosure, subprocessor register, consent on e-sign; GDPR export/delete in Settings → Security.',
  },
];

export default function Soc2Controls() {
  return (
    <LegalPageLayout title="Security & SOC 2 Controls" lastUpdated="3 July 2026">
      <section className="space-y-4">
        <p>
          This page summarises Engage by Capstone controls mapped to SOC 2 Trust Services Criteria. It supports
          enterprise due diligence and aligns with our public{' '}
          <a href="/status" className="text-primary-600 hover:underline dark:text-primary-400">
            system status
          </a>{' '}
          and{' '}
          <a href="/legal/subprocessors" className="text-primary-600 hover:underline dark:text-primary-400">
            subprocessor register
          </a>
          .
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Formal SOC 2 Type II certification requires an independent auditor. Controls below reflect the July 2026
          product implementation. Enable <code className="text-xs">REQUIRE_MFA_FOR_PRIVILEGED=true</code> and Redis
          for multi-instance deployments at go-live.
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