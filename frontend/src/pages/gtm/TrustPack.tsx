import { Link } from 'react-router-dom';
import {
  ShieldCheckIcon,
  MapPinIcon,
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
import {
  buildDiligenceSummary,
  CE_CONTROLS,
  countCeRemaining,
  RESIDENCY_FACTS,
  SUB_PROCESSORS,
  type CeStatus,
} from './trustPackData';

const LEGAL_LINKS = [
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/terms', label: 'Terms of service' },
  { href: '/legal/ai-disclosure', label: 'AI disclosure' },
  { href: '/legal/soc2', label: 'SOC 2 controls' },
  { href: '/legal/payment-collection', label: 'Payment collection' },
  { href: '/status', label: 'System status' },
];

const DILIGENCE_BLURB = buildDiligenceSummary();

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy');
  }
}

function statusTone(status: CeStatus): 'success' | 'info' | 'warning' | 'neutral' {
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
  const remaining = countCeRemaining();

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
              Cyber Essentials preparation and a UK residency story you can show a partner — without
              claiming a certificate or UK-only hosting we do not have.
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
            UK controller
          </p>
          <p className="relative z-[1] mt-1 text-xs text-slate-500">
            UK company and UK GDPR. Hosting is a documented sub-processor mix.
          </p>
        </article>
      </section>

      <section data-testid="cyber-essentials-prep">
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
          The five NCSC / IASME technical controls. {remaining} still need ops or firm-ISMS
          evidence. Never say we are CE certified until the certificate exists.
        </p>
        <div className="space-y-2">
          {CE_CONTROLS.map((row) => (
            <div
              key={row.id}
              className="metal-tile flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="relative z-[1] min-w-0">
                <p className="font-medium text-slate-900 dark:text-white">
                  {row.id} · {row.title}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{row.evidence}</p>
                <p className="mt-1 text-xs text-slate-500">Still needed: {row.remaining}</p>
                {row.href && (
                  <Link to={row.href} className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Open evidence
                  </Link>
                )}
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
          {RESIDENCY_FACTS.map((r) => (
            <article key={r.title} className="metal-tile metal-tile--soft p-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">{r.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{r.body}</p>
              {r.href && (
                <Link
                  to={r.href}
                  className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Read the policy
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Sub-processors</p>
          <p className="text-xs text-slate-500">Named so a partner can diligence without a sales fog.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-2 font-semibold text-slate-600">Provider</th>
                <th className="px-4 py-2 font-semibold text-slate-600">Role</th>
                <th className="px-4 py-2 font-semibold text-slate-600">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {SUB_PROCESSORS.map((p) => (
                <tr key={p.name}>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-50">{p.name}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{p.role}</td>
                  <td className="px-4 py-2 text-slate-500">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
