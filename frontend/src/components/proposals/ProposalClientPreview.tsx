import type { CSSProperties } from 'react';
import { format, isValid, parseISO } from 'date-fns';

export interface PreviewServiceLine {
  name: string;
  description?: string;
  quantity: number;
  displayPrice: number;
  billingCycle: string;
  grossTotal: number;
}

export interface PreviewPricingSummary {
  monthly: { total: number; count: number };
  annually: { total: number; count: number };
  quarterly: { total: number; count: number };
  weekly: { total: number; count: number };
  oneTime: { total: number; count: number };
  contractTotalIncVat: number;
}

export interface ProposalClientPreviewProps {
  practiceName: string;
  practiceLogo?: string | null;
  primaryColor?: string;
  clientName: string;
  clientContactName?: string;
  preparedByName?: string;
  preparedByTitle?: string;
  proposalTitle: string;
  coverLetter?: string;
  services: PreviewServiceLine[];
  summary: PreviewPricingSummary;
  validUntil?: string;
  terms?: string;
  showCoverLetter?: boolean;
  showTerms?: boolean;
  compact?: boolean;
}

const WATERMARK_STYLE: CSSProperties = {
  backgroundImage: "url('/images/pdf-page-background.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
};

const BILLING_LABELS: Record<string, string> = {
  WEEKLY: 'week',
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUALLY: 'year',
  ONE_TIME: 'one-off',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatValidUntil(iso?: string): string | null {
  if (!iso) return null;
  const normalized = iso.includes('T') || iso.length < 10 ? iso : `${iso.slice(0, 10)}T12:00:00`;
  const d = parseISO(normalized);
  if (!isValid(d)) return null;
  return format(d, 'd MMMM yyyy');
}

function InvestmentSummaryBands({ summary }: { summary: PreviewPricingSummary }) {
  return (
    <div className="space-y-2">
      {summary.monthly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Monthly</span>
          <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.monthly.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/month</span>
          </span>
        </div>
      )}
      {summary.annually.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Annual</span>
          <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.annually.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/year</span>
          </span>
        </div>
      )}
      {summary.quarterly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Quarterly</span>
          <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.quarterly.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/quarter</span>
          </span>
        </div>
      )}
      {summary.weekly.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Weekly</span>
          <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.weekly.total)}
            <span className="text-xs font-normal text-slate-500 ml-1">/week</span>
          </span>
        </div>
      )}
      {summary.oneTime.count > 0 && (
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">One-time</span>
          <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(summary.oneTime.total)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ProposalClientPreview({
  practiceName,
  practiceLogo,
  primaryColor = '#0ea5e9',
  clientName,
  clientContactName,
  preparedByName,
  preparedByTitle,
  proposalTitle,
  coverLetter = '',
  services,
  summary,
  validUntil,
  terms = '',
  showCoverLetter = true,
  showTerms = false,
  compact = false,
}: ProposalClientPreviewProps) {
  const contact = clientContactName?.trim();
  const showCompanyUnderContact = contact && clientName && contact !== clientName;
  const validUntilLabel = formatValidUntil(validUntil);

  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${
        compact ? '' : 'h-full'
      }`}
      data-testid="proposal-client-preview"
    >
      <div
        className="px-4 py-3 border-b border-slate-200 dark:border-slate-700"
        style={{ borderTopWidth: 3, borderTopStyle: 'solid', borderTopColor: primaryColor }}
      >
        <div className="flex items-center gap-3">
          {practiceLogo ? (
            <img src={practiceLogo} alt={practiceName} className="h-8 w-auto object-contain" />
          ) : (
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              {practiceName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">On-screen preview</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{practiceName}</p>
          </div>
        </div>
      </div>

      <div className={`p-4 sm:p-5 space-y-4 ${compact ? '' : 'max-h-[calc(100vh-12rem)] overflow-y-auto'}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: primaryColor }}>
              Prepared for
            </p>
            {contact && (
              <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">{contact}</p>
            )}
            {showCompanyUnderContact && (
              <p className="text-sm text-slate-700 dark:text-slate-300">{clientName}</p>
            )}
            {!contact && (
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1">{clientName}</p>
            )}
          </div>
          {preparedByName && (
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: primaryColor }}>
                Prepared by
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">{preparedByName}</p>
              {preparedByTitle && (
                <p className="text-sm text-slate-600 dark:text-slate-400">{preparedByTitle}</p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{practiceName}</p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
            {proposalTitle.trim() || 'Proposal title'}
          </h3>
          {validUntilLabel && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Valid until {validUntilLabel}</p>
          )}
        </div>

        {showCoverLetter && coverLetter.trim() && (
          <div>
            <div
              className="rounded-xl p-4 border text-sm leading-relaxed text-slate-700 dark:text-slate-200"
              style={{
                borderColor: `${primaryColor}33`,
                background: `linear-gradient(135deg, ${primaryColor}08, transparent)`,
              }}
            >
              <p className="whitespace-pre-wrap">{coverLetter}</p>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
            Services
          </h4>
          {services.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">No services selected yet.</p>
          ) : (
            <div className="space-y-2">
              {services.map((service, index) => (
                <div
                  key={`${service.name}-${index}`}
                  className="flex justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{service.name}</p>
                    {service.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {service.description}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {service.quantity} &times; {formatCurrency(service.displayPrice)} /{' '}
                      {BILLING_LABELS[service.billingCycle] || 'month'}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                    {formatCurrency(service.grossTotal)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {services.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <InvestmentSummaryBands summary={summary} />
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-600">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Total (inc. VAT)</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {formatCurrency(summary.contractTotalIncVat)}
              </span>
            </div>
          </div>
        )}

        {showTerms && terms.trim() && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
              Terms &amp; conditions
            </h4>
            <div
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 max-h-56 overflow-y-auto text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap relative"
              style={WATERMARK_STYLE as CSSProperties}
            >
              <div className="relative z-10 bg-white/85 dark:bg-slate-900/88 rounded-lg p-3 backdrop-blur-[1px]">
                {terms}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}