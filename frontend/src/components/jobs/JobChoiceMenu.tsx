import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { shouldPersistChoice, type JobChoiceOption } from './jobChoice';

/**
 * Optional job field (board column / assignee). Native &lt;select&gt; on Windows
 * and tablets is a picker you must complete — that trapped staff on job detail.
 * This menu closes on click-away, Escape, or the current value, and only
 * calls onChange when the value actually changes.
 */
export default function JobChoiceMenu({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: JobChoiceOption[];
  onChange: (next: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(next: string) {
    setOpen(false);
    if (!shouldPersistChoice(value, next)) return;
    onChange(next);
  }

  return (
    <div ref={rootRef} className="relative" data-testid={testId}>
      <p className="text-xs text-slate-500">{label}</p>
      <button
        type="button"
        className="input-field mt-1 flex min-w-[10rem] items-center justify-between gap-2 text-left text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{current?.label || '—'}</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 min-w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
        >
          {options.map((o) => (
            <li key={o.value || 'empty'}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  o.value === value
                    ? 'font-semibold text-emerald-800 dark:text-emerald-200'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
                onClick={() => pick(o.value)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
