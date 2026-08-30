import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CurrencyPoundIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { StatusChip } from '../../components/ui/StatusChip';
import { formatGbp } from './switcherRoi';
import {
  comparePackaging,
  ENGAGE_TIERS,
  FOUNDING_PROFESSIONAL_MONTHLY,
  formatPackagingPitch,
} from './packagingValue';

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy — select the text manually');
  }
}

export default function ValuePackaging() {
  const [clients, setClients] = useState(120);
  const [users, setUsers] = useState(6);
  const [engagerPerClient, setEngagerPerClient] = useState(9);

  const comparison = useMemo(
    () => comparePackaging({ clients, users, engagerPerClient }),
    [clients, users, engagerPerClient]
  );
  const pitch = useMemo(
    () => formatPackagingPitch({ clients, users, comparison }),
    [clients, users, comparison]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="metal-tile metal-tile--mint overflow-hidden p-6 sm:p-8">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="metal-kicker">Partner demo kit</p>
              <StatusChip tone="mint">Value pack</StatusChip>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Packaging vs £9/client
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Engager sells a cheap-looking unit price and unlimited users. We sell the money loop.
              Pick the ladder, show the sticker at their book size, and do not race to £8.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/switch-from-engager" className="btn-secondary text-sm">
                Battle card &amp; ROI
              </Link>
              <Link to="/subscription" className="btn-secondary text-sm">
                Billing
              </Link>
              <Link to="/partners" className="btn-ghost text-sm">
                Partner programme
              </Link>
            </div>
          </div>
          <BrandLogo className="h-24 w-auto max-w-[12rem] object-contain self-start sm:self-center" />
        </div>
      </header>

      <section className="metal-tile p-5 sm:p-6" data-testid="value-packaging">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="metal-kicker">Recommend a pack</p>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Their book, our ladder
              </h2>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => void copyText('Packaging pitch', pitch)}
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              Copy pitch
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-500">
              Active clients
              <input
                type="number"
                min={0}
                className="input-field mt-1"
                value={clients}
                onChange={(e) => setClients(Number(e.target.value) || 0)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Staff users
              <input
                type="number"
                min={1}
                className="input-field mt-1"
                value={users}
                onChange={(e) => setUsers(Number(e.target.value) || 1)}
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
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-2xs font-semibold uppercase text-emerald-800/80">Recommended</p>
              <p className="mt-1 text-xl font-bold text-emerald-900 dark:text-emerald-200">
                {comparison.recommended.name}
              </p>
              <p className="text-sm tabular-nums text-emerald-800 dark:text-emerald-300">
                {formatGbp(comparison.engageMonthly)}/mo
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {comparison.reasons.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-2xs font-semibold uppercase text-slate-500">Engager-class / mo</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatGbp(comparison.engagerMonthly)}
              </p>
              <p className="text-xs text-slate-500">
                {clients || 0} × {formatGbp(comparison.engagerPerClient)}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-2xs font-semibold uppercase text-slate-500">
                Engage £ / client equivalent
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {comparison.engagePerClient == null
                  ? '—'
                  : `£${comparison.engagePerClient.toFixed(2)}`}
              </p>
              <p className="text-xs text-slate-500">
                {comparison.engageCheaperOnSticker
                  ? `${formatGbp(comparison.stickerDelta)}/mo less on sticker`
                  : 'Close on the loop, not the unit price'}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section>
        <p className="metal-kicker">The ladder</p>
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
          £49 · £99 · £249 — not £9 times the book
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {ENGAGE_TIERS.map((tier) => {
            const active = tier.id === comparison.recommended.id;
            return (
              <article
                key={tier.id}
                className={`rounded-xl border p-4 ${
                  active
                    ? 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/30'
                    : 'border-slate-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{tier.name}</h3>
                  {active && <StatusChip tone="mint">Fit</StatusChip>}
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatGbp(tier.monthly)}
                  <span className="text-sm font-medium text-slate-500">/mo</span>
                </p>
                <p className="text-xs text-slate-500">{formatGbp(tier.annual)} billed annually</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <li>
                    {tier.users == null ? 'Unlimited users' : `${tier.users} users`}
                  </li>
                  <li>
                    {tier.clients == null ? 'Unlimited clients' : `${tier.clients} clients`}
                  </li>
                  <li>
                    {tier.proposalsPerMonth == null
                      ? 'Unlimited proposals'
                      : `${tier.proposalsPerMonth} proposals / mo`}
                  </li>
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="metal-tile p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <p className="metal-kicker">Do not say</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li>We will match £9/client.</li>
              <li>Unlimited users, so we should be cheaper.</li>
              <li>Start them on a custom mid-tier to win the deal.</li>
            </ul>
          </div>
        </div>
        <div className="metal-tile metal-tile--mint p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <p className="metal-kicker">Do say</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex gap-2">
                <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                Users are included in the pack — we do not meter the team.
              </li>
              <li className="flex gap-2">
                <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                The close is win → sign → collect → job. Engager runs the job.
              </li>
              <li className="flex gap-2">
                <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                Founding Practice: Professional at {formatGbp(FOUNDING_PROFESSIONAL_MONTHLY)}/mo for
                12 months, first 20 firms — a launch offer, not a new unit price.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-sm text-emerald-900 dark:text-emerald-100">
          Model hours reclaimed on the battle card if they still fixate on the unit price.
        </p>
        <Link to="/switch-from-engager" className="btn-accent text-sm inline-flex items-center gap-1">
          Open ROI <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
