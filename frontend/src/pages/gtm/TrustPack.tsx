import { Link } from 'react-router-dom';
import {
  ShieldCheckIcon,
  MapPinIcon,
  ServerIcon,
  DocumentCheckIcon,
  LockClosedIcon,
  ClockIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { StatusChip } from '../../components/ui/StatusChip';

const CE_PREP = [
  {
    title: 'Boundary firewalls & secure config',
    status: 'In product',
    detail: 'TLS termination on Render; no direct DB exposure; CORS and CSRF on API.',
  },
  {
    title: 'Secure access control',
    status: 'In product',
    detail: 'JWT auth, RBAC, MFA/TOTP, tenant isolation on every data path.',
  },
  {
    title: 'Malware protection',
    status: 'Ops',
    detail: 'Host AV / managed platform responsibility; document in firm ISMS at go-live.',
  },
  {
    title: 'Patch management',
    status: 'Pipeline',
    detail: 'Dependabot / lockfiles; production deploys from reviewed master only.',
  },
  {
    title: 'Secure configuration',
    status: 'In product',
    detail: 'Secrets in env; encryption helpers; production DDL disabled on admin routes.',
  },
];

const RESIDENCY = [
  {
    icon: MapPinIcon,
    title: 'UK commercial entity',
    body: 'Capstone Software — UK company serving UK accountancy practices.',
  },
  {
    icon: ServerIcon,
    title: 'Hosting',
    body: 'Application services on Render (document region choice at cutover). Postgres and object storage regions recorded in runbooks.',
  },
  {
    icon: LockClosedIcon,
    title: 'Data protection',
    body: 'GDPR-aligned privacy policy, e-sign consent, AI disclosure, tenant-scoped data access.',
  },
  {
    icon: DocumentCheckIcon,
    title: 'Due diligence pack',
    body: 'SOC 2 control map, public status page, signature forensic certificates for engagements.',
  },
];

const LEGAL_LINKS = [
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/terms', label: 'Terms of service' },
  { href: '/legal/ai-disclosure', label: 'AI disclosure' },
  { href: '/legal/soc2', label: 'SOC 2 controls' },
  { href: '/legal/payment-collection', label: 'Payment collection' },
  { href: '/status', label: 'System status' },
];

const DILIGENCE_BLURB = `Engage by Capstone — Trust & UK residency summary

Entity: Capstone Software (UK), serving UK accountancy practices.
Product: Engage — proposal → e-sign → collect → practice delivery (jobs, mailbox, forms, automations).
Security: JWT + RBAC + MFA; tenant isolation; TLS; CSRF; encrypted secrets for OAuth.
Evidence in product:
• Forensic e-sign certificate (hash, IP, UA, consent) on proposal Audit tab
• Public status page
• Privacy, terms, AI disclosure, payment collection terms
Cyber Essentials: prep map in product (not a certificate) — certification scheduled separately.
AccountFlow mesh: mock-default in practice builds; production AF never contacted until explicit cutover.

Contact: hello@capstonesoftware.co.uk
Subject: Engage trust pack / due diligence`;

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy');
  }
}

function statusTone(status: string): 'success' | 'info' | 'warning' | 'neutral' {
  if (status === 'In product') return 'success';
  if (status === 'Ops') return 'info';
  if (status === 'Pipeline') return 'warning';
  return 'neutral';
}

/**
 * Partner due-diligence pack. Headings stable for e2e:
 * "Trust & UK residency", "Cyber Essentials — prep map"
 */
export default function TrustPack() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <header className="metal-tile overflow-hidden p-6 sm:p-8">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="metal-kicker">Partner demo kit</p>
              <StatusChip tone="mint">Trust pack</StatusChip>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              Trust &amp; UK residency
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Enterprise and partner due diligence in one place — Cyber Essentials preparation,
              residency narrative, and links to live control documentation.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => void copyText('Diligence summary', DILIGENCE_BLURB)}
              >
                <ClipboardDocumentIcon className="h-4 w-4" aria-hidden />
                Copy diligence summary
              </button>
              <a
                href={`mailto:hello@capstonesoftware.co.uk?subject=${encodeURIComponent(
                  'Engage trust pack / due diligence'
                )}&body=${encodeURIComponent(DILIGENCE_BLURB)}`}
                className="btn-secondary text-sm"
              >
                <EnvelopeIcon className="h-4 w-4" aria-hidden />
                Email pack
              </a>
              <Link to="/legal/soc2" className="btn-ghost text-sm">
                SOC 2 controls
              </Link>
              <Link to="/status" className="btn-ghost text-sm">
                System status
              </Link>
              <Link to="/switch-from-engager" className="btn-ghost text-sm">
                Switch from Engager
              </Link>
            </div>
          </div>
          <BrandLogo className="h-24 w-auto object-contain" />
        </div>
      </header>

      {/* Partner one-liners */}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="metal-tile metal-tile--mint p-4">
          <span className="metal-specular" aria-hidden />
          <CheckBadgeIcon className="relative z-[1] h-6 w-6 text-emerald-600" />
          <p className="relative z-[1] mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Tenant isolation
          </p>
          <p className="relative z-[1] mt-1 text-xs text-slate-500">
            Every query scoped by tenant — multi-practice ready.
          </p>
        </article>
        <article className="metal-tile metal-tile--sky p-4">
          <span className="metal-specular" aria-hidden />
          <LockClosedIcon className="relative z-[1] h-6 w-6 text-sky-600" />
          <p className="relative z-[1] mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Forensic e-sign
          </p>
          <p className="relative z-[1] mt-1 text-xs text-slate-500">
            Certificate with hash, IP, UA, consent on every engagement.
          </p>
        </article>
        <article className="metal-tile metal-tile--violet p-4">
          <span className="metal-specular" aria-hidden />
          <MapPinIcon className="relative z-[1] h-6 w-6 text-violet-600" />
          <p className="relative z-[1] mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            UK-first
          </p>
          <p className="relative z-[1] mt-1 text-xs text-slate-500">
            UK English, MTD awareness, UK commercial entity.
          </p>
        </article>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-emerald-600" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Cyber Essentials — prep map
            </h2>
          </div>
          <StatusChip tone="warning">Not a certificate</StatusChip>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Honest sales answer: product + ops checklist while formal CE certification is scheduled.
          Never claim “we are CE certified” until the certificate exists.
        </p>
        <div className="space-y-2">
          {CE_PREP.map((row) => (
            <div
              key={row.title}
              className="metal-tile flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="relative z-[1] min-w-0">
                <p className="font-medium text-slate-900 dark:text-white">{row.title}</p>
                <p className="text-sm text-slate-500">{row.detail}</p>
              </div>
              <span className="relative z-[1] shrink-0">
                <StatusChip tone={statusTone(row.status)}>{row.status}</StatusChip>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <MapPinIcon className="h-5 w-5 text-sky-600" aria-hidden />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            UK residency story
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {RESIDENCY.map((r) => (
            <article key={r.title} className="metal-tile metal-tile--soft p-4">
              <r.icon className="h-6 w-6 text-slate-500" aria-hidden />
              <h3 className="mt-2 font-semibold text-slate-900 dark:text-white">{r.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="metal-tile metal-tile--mint p-5">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1]">
          <span className="metal-kicker">Evidence in product</span>
          <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <li className="flex gap-2">
              <DocumentCheckIcon className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              Proposal Audit tab — signature certificate PDF + JSON (hash, IP, UA, consent)
            </li>
            <li className="flex gap-2">
              <ClockIcon className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              Public status page — component health for sales &amp; clients
            </li>
            <li className="flex gap-2">
              <LockClosedIcon className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              Legal: privacy, terms, AI disclosure, payment collection terms
            </li>
          </ul>
        </div>
      </section>

      <section>
        <p className="metal-kicker mb-2">Legal &amp; status links</p>
        <div className="flex flex-wrap gap-2">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} to={l.href} className="btn-secondary btn-sm">
              {l.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-4 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Questions for diligence?{' '}
          <a
            href="mailto:hello@capstonesoftware.co.uk?subject=Engage%20trust%20pack"
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            hello@capstonesoftware.co.uk
          </a>
        </p>
        <p className="mt-2 text-2xs text-slate-400">
          Practice builds use mock AccountFlow mesh — production AF is never contacted until
          explicit cutover.
        </p>
      </div>
    </div>
  );
}
