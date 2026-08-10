import { useEffect, useState } from 'react';
import { resolveBrandLogo } from '../../utils/brandLogo';

/**
 * Theme-aware Capstone Engage mark.
 * Framed in a pale plate so photo logos (white/dark fields) sit cleanly on the UI.
 */
export function BrandLogo({
  tenantLogo,
  alt = 'Capstone Engage',
  className = 'h-10 w-auto max-w-[11rem] object-contain',
  framed = true,
  frameClassName = '',
}: {
  tenantLogo?: string | null;
  alt?: string;
  className?: string;
  /** Soft pale border + background around the mark (default true) */
  framed?: boolean;
  frameClassName?: string;
}) {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const src = resolveBrandLogo({ tenantLogo, isDark });
  const img = <img src={src} alt={alt} className={className} />;

  if (!framed) return img;

  return (
    <span
      className={`brand-logo-plate inline-flex items-center justify-center overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50 shadow-sm dark:border-slate-600 dark:bg-slate-800/90 ${frameClassName}`}
    >
      <span className="brand-logo-plate-inner flex items-center justify-center p-1.5 sm:p-2">
        {img}
      </span>
    </span>
  );
}
