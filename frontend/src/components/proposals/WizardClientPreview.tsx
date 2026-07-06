import { formatCurrency, formatDate } from '../../utils/formatters';

interface PreviewService {
  name: string;
  displayPrice: number;
  billingFrequency: string;
}

interface WizardClientPreviewProps {
  practiceName: string;
  primaryColor?: string;
  clientName: string;
  proposalTitle: string;
  coverLetter?: string;
  validUntil?: string;
  services: PreviewService[];
  emailSubject?: string;
  emailBody?: string;
  mode?: 'proposal' | 'email';
}

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: 'per week',
  MONTHLY: 'per month',
  QUARTERLY: 'per quarter',
  ANNUALLY: 'per year',
  ONE_TIME: 'one-off',
};

export default function WizardClientPreview({
  practiceName,
  primaryColor = '#0ea5e9',
  clientName,
  proposalTitle,
  coverLetter,
  validUntil,
  services,
  emailSubject,
  emailBody,
  mode = 'proposal',
}: WizardClientPreviewProps) {
  const total = services.reduce((sum, s) => sum + (s.displayPrice || 0), 0);

  return (
    <div className="h-full rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900/80 overflow-hidden flex flex-col shadow-inner">
      <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/50">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
          Client preview
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
          How {clientName} will see this
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {mode === 'email' ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-[10px] text-slate-500 uppercase">Subject</p>
              <p className="font-medium text-slate-900 dark:text-white mt-0.5">
                {emailSubject || `Proposal from ${practiceName}`}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 whitespace-pre-wrap text-slate-700 dark:text-slate-200 leading-relaxed min-h-[200px]">
              {emailBody || (
                <span className="text-slate-400 italic">
                  Clara will draft your send email here…
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-base" style={{ color: primaryColor }}>
                  {practiceName}
                </span>
                <span className="text-[10px] text-slate-500 uppercase">Proposal</span>
              </div>
              <div className="h-0.5 mt-2 rounded" style={{ backgroundColor: primaryColor }} />
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{proposalTitle}</h3>
              <p className="text-xs text-slate-500 mt-1">Prepared for {clientName}</p>
              {validUntil && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Valid until {formatDate(validUntil)}
                </p>
              )}
            </div>

            {coverLetter && (
              <div className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap text-xs leading-relaxed border-l-2 border-violet-200 dark:border-violet-800 pl-3">
                {coverLetter.slice(0, 600)}
                {coverLetter.length > 600 ? '…' : ''}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                Services
              </p>
              {services.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No services selected yet</p>
              ) : (
                services.map((s, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    className="flex justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <span className="text-slate-800 dark:text-slate-200">{s.name}</span>
                    <span className="text-slate-900 dark:text-white font-medium tabular-nums shrink-0">
                      {formatCurrency(s.displayPrice)}
                      <span className="text-[10px] text-slate-500 font-normal ml-1">
                        {FREQ_LABELS[s.billingFrequency] || s.billingFrequency?.toLowerCase()}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>

            {services.length > 0 && (
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white">
                <span>Indicative total</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
