import { BrandLogo } from '../../components/ui/BrandLogo';
import {
  formatEngageLadder,
  ONE_PAGER_CTA,
  ONE_PAGER_DIFFERENTIATORS,
  ONE_PAGER_HEADLINE,
  ONE_PAGER_LOOP,
  ONE_PAGER_PROBLEM,
  ONE_PAGER_ROWS,
} from './competitorOnePager';

/**
 * A4 leave-behind. On screen it sits as a paper sheet; print CSS hides the rest of the kit.
 */
export default function CompetitorOnePager() {
  return (
    <section
      id="competitor-one-pager"
      data-testid="competitor-one-pager"
      className="gtm-one-pager mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
    >
      <div className="border-b border-emerald-600/40 px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="metal-kicker">Partner leave-behind · one page</p>
            <h2 className="mt-2 max-w-xl text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[1.7rem]">
              {ONE_PAGER_HEADLINE}
            </h2>
          </div>
          <BrandLogo className="h-16 w-auto max-w-[7.5rem] shrink-0 object-contain" />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {ONE_PAGER_PROBLEM}
        </p>
        <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
          {ONE_PAGER_LOOP.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              {i > 0 && (
                <span className="font-normal text-slate-400" aria-hidden>
                  →
                </span>
              )}
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-0 sm:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 sm:border-b-0 sm:border-r sm:px-8">
          <p className="metal-kicker">Why Engage</p>
          <ul className="space-y-3">
            {ONE_PAGER_DIFFERENTIATORS.map((d) => (
              <li key={d.title}>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{d.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {d.line}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-5 sm:px-7">
          <p className="metal-kicker">Side by side</p>
          <table className="mt-3 w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800">
                <th className="py-1.5 pr-2 font-semibold">Capability</th>
                <th className="py-1.5 pr-2 font-semibold">Engager</th>
                <th className="py-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                  Engage
                </th>
              </tr>
            </thead>
            <tbody>
              {ONE_PAGER_ROWS.map((row) => (
                <tr key={row.capability} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-2 font-medium text-slate-800 dark:text-slate-200">
                    {row.capability}
                  </td>
                  <td className="py-2 pr-2 text-slate-500">{row.engager}</td>
                  <td className="py-2 text-slate-900 dark:text-slate-100">{row.engage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-emerald-600/40 px-6 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <p className="metal-kicker">Pack</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {formatEngageLadder()} / month
          </p>
          <p className="text-xs text-slate-500">
            Do not race to £9/client. The pack is the loop, not the book size.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            {ONE_PAGER_CTA.replace('https://', '')}
          </p>
          <p className="text-xs text-slate-500">12-minute walkthrough · Partner kit in the app</p>
        </div>
      </div>
      <p className="border-t border-slate-200 px-6 py-2 text-[10px] leading-relaxed text-slate-500 dark:border-slate-800 sm:px-8">
        Illustrative only — not a quote. Clara never sends. We do not claim Cyber Essentials certified
        or UK-only hosting.
      </p>
    </section>
  );
}
