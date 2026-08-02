import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ScaleIcon,
  SparklesIcon,
  CurrencyPoundIcon,
  CheckIcon,
  XMarkIcon,
  ArrowRightIcon,
  ClipboardDocumentIcon,
  ChatBubbleBottomCenterTextIcon,
  PlayCircleIcon,
  InboxIcon,
  DocumentTextIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { MetalTile } from '../../components/ui/MetalTile';
import { StatusChip } from '../../components/ui/StatusChip';
import { PRIMARY_CREATE } from '../../config/navigation';

const COMPARISON: Array<{
  capability: string;
  engager: string | boolean;
  engage: string | boolean;
  note?: string;
}> = [
  {
    capability: 'UK proposal → e-sign → collect',
    engager: 'Partial',
    engage: true,
    note: 'Stripe Connect / recurring at accept',
  },
  {
    capability: 'Clara AI (draft, chase, prioritise)',
    engager: false,
    engage: true,
    note: 'Human-in-the-loop co-pilot',
  },
  {
    capability: 'Jobs board + tasks + workload',
    engager: true,
    engage: true,
  },
  {
    capability: 'Two-way firm mailbox',
    engager: true,
    engage: true,
    note: 'Gmail / M365 sync + compose / reply',
  },
  {
    capability: 'Bulk client forms',
    engager: true,
    engage: true,
    note: 'UK packs · assign many · portal submit',
  },
  {
    capability: 'Portal OS (tasks, messages, files)',
    engager: true,
    engage: true,
  },
  {
    capability: 'Visual automations + UK packs',
    engager: true,
    engage: true,
    note: 'Server rules · dry-run · run history',
  },
  {
    capability: 'E-sign forensic certificate',
    engager: 'Basic',
    engage: true,
  },
  {
    capability: 'Independent of TaxCalc',
    engager: false,
    engage: true,
    note: 'Capstone practice stack',
  },
  {
    capability: 'AccountFlow mesh',
    engager: false,
    engage: 'Sandbox → live',
    note: 'Mock by default — no prod AF risk',
  },
  {
    capability: 'Price signal',
    engager: '£9/client/mo class',
    engage: 'Value packaging',
    note: 'Win on cycle time + cash collected',
  },
];

const DEMO_STEPS = [
  {
    n: '01',
    title: 'Home day rail',
    href: '/',
    line: 'Jobs · Inbox · New proposal — one hop into the daily loop.',
  },
  {
    n: '02',
    title: 'Win work (wizard)',
    href: PRIMARY_CREATE.href,
    line: 'Companies House → services → price → send. Clara fills the draft.',
  },
  {
    n: '03',
    title: 'Jobs board',
    href: '/jobs',
    line: 'Accepted work on the board. Clara prioritise · bulk column moves.',
  },
  {
    n: '04',
    title: 'Mailbox',
    href: '/inbox',
    line: 'Two-way thread · sync Gmail/M365 · reply without leaving Engage.',
  },
  {
    n: '05',
    title: 'Bulk forms',
    href: '/forms',
    line: 'Assign UK packs to many clients · portal complete · staff tracker.',
  },
  {
    n: '06',
    title: 'Automations',
    href: '/automations',
    line: 'Install VAT/SA pack · dry-run · execute · show run history.',
  },
];

const OBJECTIONS = [
  {
    q: 'We’re on TaxCalc / Engager already.',
    a: 'Engage is distribution-independent. You keep the delivery OS, add cash + Clara. AccountFlow mesh when you want a deeper ops spine — never forced TaxCalc.',
  },
  {
    q: '£9 per client looks cheaper.',
    a: 'Price the full cycle: draft time, chase, sign, collect, board admin. ROI calculator models hours reclaimed — not a race to the bottom on seats.',
  },
  {
    q: 'AI is risky for compliance.',
    a: 'Clara is human-in-the-loop. Forensic e-sign certificates, AI disclosure, tenant isolation, and approval queues are first-class — not a black-box send.',
  },
  {
    q: 'Can we migrate without downtime?',
    a: 'CSV client import, parallel run with Engager, cutover only when you say go. Practice clone is isolated from production AccountFlow.',
  },
  {
    q: 'What about mobile?',
    a: 'Capacitor iOS shell is staged after desktop sign-off. Staff tabs: Home · Jobs · Inbox · Clients · Proposals.',
  },
];

const ELEVATOR = `Engage by Capstone is the only UK practice platform that wins the client, collects the fee, and runs the job — with Clara as co-pilot.

Engager is strong on practice management. Engage matches the board and then adds: proposal → e-sign → Stripe collect → jobs → two-way mailbox → bulk forms → automations — independent of TaxCalc.`;

function Cell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
        <CheckIcon className="h-4 w-4" aria-hidden /> Yes
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-400">
        <XMarkIcon className="h-4 w-4" aria-hidden /> No
      </span>
    );
  }
  return <span className="text-slate-700 dark:text-slate-200">{value}</span>;
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy — select the text manually');
  }
}

/**
 * Partner battle card: ROI, comparison, demo script, objections.
 * Headings kept stable for e2e (Switch from Engager to Engage, ROI calculator).
 */
export default function SwitchFromEngager() {
  const [clients, setClients] = useState(120);
  const [hoursPerMonth, setHoursPerMonth] = useState(18);
  const [hourlyRate, setHourlyRate] = useState(85);
  const [engagerPerClient, setEngagerPerClient] = useState(9);
  const [engageMonthly, setEngageMonthly] = useState(149);

  const roi = useMemo(() => {
    const timeValue = hoursPerMonth * hourlyRate;
    const engagerCost = clients * engagerPerClient;
    const netVsEngager = engagerCost + timeValue - engageMonthly;
    const paybackWeeks: string =
      engageMonthly > 0 && timeValue > 0
        ? String(Math.max(0.5, Number((engageMonthly / (timeValue / 4.33)).toFixed(1))))
        : '—';
    return {
      timeValue,
      engagerCost,
      engageMonthly,
      netVsEngager,
      paybackWeeks,
      annual: netVsEngager * 12,
    };
  }, [clients, hoursPerMonth, hourlyRate, engagerPerClient, engageMonthly]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    }).format(n);

  const roiSummary = `Illustrative switch model (${clients} clients):
• Time value: ${fmt(roi.timeValue)}/mo (${hoursPerMonth}h × £${hourlyRate})
• Engager-class: ${fmt(roi.engagerCost)}/mo
• Engage plan: ${fmt(roi.engageMonthly)}/mo
• Net advantage: ${fmt(roi.netVsEngager)}/mo · ${fmt(roi.annual)}/yr
• ~${roi.paybackWeeks} weeks to recover plan cost from time alone
(Not a quote — adjust hours for your firm.)`;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="metal-tile metal-tile--mint overflow-hidden p-6 sm:p-8">
        <span className="metal-specular" aria-hidden />
        <span className="metal-glare" aria-hidden />
        <div className="relative z-[1] flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="metal-kicker">Partner demo kit</p>
              <StatusChip tone="mint">Battle card</StatusChip>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Switch from Engager to Engage
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Keep delivery ops. Add the money loop Engager lacks — Companies House → priced
              proposal → signed engagement → collected fees → jobs → mailbox → forms — with Clara
              as co-pilot.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to={PRIMARY_CREATE.href}
                className="btn-primary inline-flex items-center gap-1 text-sm"
              >
                Start proposal wizard <ArrowRightIcon className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/jobs" className="btn-secondary text-sm">
                Jobs board
              </Link>
              <Link to="/inbox" className="btn-secondary text-sm">
                Mailbox
              </Link>
              <Link to="/forms" className="btn-secondary text-sm">
                Bulk forms
              </Link>
              <Link to="/trust" className="btn-ghost text-sm">
                Trust pack
              </Link>
            </div>
          </div>
          <BrandLogo className="h-28 w-auto max-w-[12rem] object-contain self-start sm:self-center" />
        </div>
      </header>

      {/* One-liner for partners */}
      <section className="metal-tile p-5">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="metal-kicker">Elevator pitch</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {ELEVATOR}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            onClick={() => void copyText('Pitch', ELEVATOR)}
          >
            <ClipboardDocumentIcon className="h-4 w-4" aria-hidden />
            Copy pitch
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetalTile
          tone="mint"
          kicker="Win"
          title="Why switch"
          value="Cash + Clara"
          hint="Sign → collect → deliver in one product"
        />
        <MetalTile
          tone="sky"
          kicker="Match"
          title="Ops parity"
          value="Board + inbox"
          hint="Jobs, forms, automations, portal OS"
        />
        <MetalTile
          tone="violet"
          kicker="Moat"
          title="UK intelligence"
          value="CH → fee"
          hint="Not locked to TaxCalc distribution"
        />
      </section>

      {/* Partner demo path — clickable */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="metal-kicker">Live demo path</p>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              12-minute partner walkthrough
            </h2>
            <p className="text-xs text-slate-500">
              Click each step to open the surface — leave this tab open as your run sheet.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() =>
              void copyText(
                'Demo script',
                DEMO_STEPS.map((s) => `${s.n} ${s.title}: ${s.line}`).join('\n')
              )
            }
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            Copy script
          </button>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_STEPS.map((s) => (
            <li key={s.n}>
              <Link to={s.href} className="path-tile h-full">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold tabular-nums text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 leading-snug">{s.line}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Money loop — partner close */}
      <section className="metal-tile metal-tile--mint p-5">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1]">
          <p className="metal-kicker">Money loop (clearance)</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
            Engager runs the job — Engage also wins and collects the fee
          </h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-5 text-xs">
            {[
              { t: 'Win', d: 'Wizard + Clara + CH', h: PRIMARY_CREATE.href },
              { t: 'Sign', d: 'E-sign + forensic cert', h: '/proposals' },
              { t: 'Collect', d: 'Stripe · MRR · dunning', h: '/analytics' },
              { t: 'Deliver', d: 'Jobs board · time', h: '/jobs' },
              { t: 'Renew', d: 'Bulk renewals', h: '/proposals/renewals' },
            ].map((s) => (
              <li key={s.t}>
                <Link to={s.h} className="path-tile !p-3 flex-col items-start">
                  <span className="font-bold text-slate-900 dark:text-white">{s.t}</span>
                  <span className="text-slate-500">{s.d}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ROI calculator — heading text must stay for e2e */}
      <section className="metal-tile p-5 sm:p-6">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CurrencyPoundIcon className="h-5 w-5 text-emerald-600" aria-hidden />
              <div>
                <p className="metal-kicker">ROI calculator</p>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Model your switch (illustrative)
                </h2>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => void copyText('ROI summary', roiSummary)}
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              Copy numbers
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-slate-500">
              Active clients
              <input
                type="number"
                min={10}
                className="input-field mt-1"
                value={clients}
                onChange={(e) => setClients(Number(e.target.value) || 0)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Hours saved / month
              <input
                type="number"
                min={0}
                className="input-field mt-1"
                value={hoursPerMonth}
                onChange={(e) => setHoursPerMonth(Number(e.target.value) || 0)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Blended £ / hour
              <input
                type="number"
                min={0}
                className="input-field mt-1"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value) || 0)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Engager-class £ / client
              <input
                type="number"
                min={0}
                step={0.5}
                className="input-field mt-1"
                value={engagerPerClient}
                onChange={(e) => setEngagerPerClient(Number(e.target.value) || 0)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Engage plan £ / month
              <input
                type="number"
                min={0}
                className="input-field mt-1"
                value={engageMonthly}
                onChange={(e) => setEngageMonthly(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-2xs font-semibold uppercase text-slate-500">Time value / mo</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmt(roi.timeValue)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-2xs font-semibold uppercase text-slate-500">Engager-class / mo</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmt(roi.engagerCost)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-2xs font-semibold uppercase text-emerald-800/80">
                Net advantage / mo
              </p>
              <p className="text-xl font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                {fmt(roi.netVsEngager)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-2xs font-semibold uppercase text-slate-500">Annual advantage</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmt(roi.annual)}
              </p>
              <p className="text-2xs text-slate-400">~{roi.paybackWeeks} weeks to recover plan</p>
            </div>
          </div>
          <p className="mt-3 text-2xs text-slate-400">
            Illustrative only — not a quote. Adjust hours for proposal drafting, chase follow-up, and
            board admin reclaimed with Clara + ops.
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <ScaleIcon className="h-5 w-5 text-slate-500" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Capability comparison
            </h2>
          </div>
          <p className="text-2xs text-slate-400">Engager-class = TaxCalc Engager pattern</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                  Capability
                </th>
                <th className="px-4 py-3 font-semibold text-slate-500">Engager-class</th>
                <th className="px-4 py-3 font-semibold text-emerald-800 dark:text-emerald-300">
                  Engage by Capstone
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {COMPARISON.map((row) => (
                <tr key={row.capability} className="bg-white/80 dark:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-50">
                      {row.capability}
                    </p>
                    {row.note && <p className="text-2xs text-slate-400">{row.note}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Cell value={row.engager} />
                  </td>
                  <td className="px-4 py-3">
                    <Cell value={row.engage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Classic 5-min script + objections */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="metal-tile p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <div className="flex items-center gap-2">
              <PlayCircleIcon className="h-5 w-5 text-emerald-600" aria-hidden />
              <div>
                <span className="metal-kicker">Demo script</span>
                <h3 className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                  5-minute walkthrough
                </h3>
              </div>
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>Dashboard — day rail + cash under management + dunning</li>
              <li>Jobs board — Clara prioritise + bulk move</li>
              <li>Accept path — proposal → job spawn → portal forms</li>
              <li>Automations — install a UK pack, dry-run rules</li>
              <li>Inbox — mailbox reply + client Comms timeline</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/" className="btn-ghost btn-sm">
                <BriefcaseIcon className="h-3.5 w-3.5" /> Home
              </Link>
              <Link to="/inbox" className="btn-ghost btn-sm">
                <InboxIcon className="h-3.5 w-3.5" /> Inbox
              </Link>
              <Link to="/forms" className="btn-ghost btn-sm">
                <DocumentTextIcon className="h-3.5 w-3.5" /> Forms
              </Link>
            </div>
          </div>
        </div>
        <div className="metal-tile metal-tile--sky p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <div className="flex items-center gap-2">
              <ChatBubbleBottomCenterTextIcon className="h-5 w-5 text-sky-600" aria-hidden />
              <div>
                <span className="metal-kicker">Objections</span>
                <h3 className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                  Quick counters
                </h3>
              </div>
            </div>
            <ul className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {OBJECTIONS.map((o) => (
                <li key={o.q}>
                  <p className="font-semibold text-slate-800 dark:text-white">“{o.q}”</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {o.a}
                  </p>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-secondary btn-sm mt-4"
              onClick={() =>
                void copyText(
                  'Objections',
                  OBJECTIONS.map((o) => `Q: ${o.q}\nA: ${o.a}`).join('\n\n')
                )
              }
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              Copy objection pack
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-emerald-600" aria-hidden />
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            Production cutover only when you say so — prep in{' '}
            <code className="text-xs">docs/CUTOVER_PREP.md</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/trust" className="btn-secondary text-xs">
            Trust pack
          </Link>
          <Link to="/partners" className="btn-secondary text-xs">
            Partner programme
          </Link>
        </div>
      </div>
    </div>
  );
}
