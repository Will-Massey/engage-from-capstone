interface ComingSoonCalloutProps {
  title: string;
  children: React.ReactNode;
  testId?: string;
}

export default function ComingSoonCallout({ title, children, testId }: ComingSoonCalloutProps) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
      data-testid={testId}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
        Coming soon
      </p>
      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </div>
  );
}
