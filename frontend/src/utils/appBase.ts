/** App base path — `/engage` in production, `/` locally. */
export const APP_BASENAME = (import.meta.env.VITE_APP_BASE || '/').replace(/\/$/, '') || '';

/** Strip APP_BASENAME from a full browser pathname (e.g. `/engage/login` → `/login`). */
export function appRelativePath(pathname?: string): string {
  const full = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  if (!APP_BASENAME) return full || '/';
  if (full === APP_BASENAME || full === `${APP_BASENAME}/`) return '/';
  if (full.startsWith(`${APP_BASENAME}/`)) {
    const rest = full.slice(APP_BASENAME.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return full;
}

export function appPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return APP_BASENAME ? `${APP_BASENAME}${normalized}` : normalized;
}