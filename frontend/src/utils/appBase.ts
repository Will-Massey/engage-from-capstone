/** App base path — `/engage` in production, `/` locally. */
export const APP_BASENAME = (import.meta.env.VITE_APP_BASE || '/').replace(/\/$/, '') || '';

export function appPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return APP_BASENAME ? `${APP_BASENAME}${normalized}` : normalized;
}