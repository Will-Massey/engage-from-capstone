/**
 * Base-path-aware default brand logos — Metal Mint wordmark.
 *
 * Light = white-field metal (login, light chrome)
 * Dark  = charcoal-field metal (dark mode sidebar / night UI)
 *
 * Tenants with an uploaded logo override these defaults.
 */

const base = import.meta.env.BASE_URL;

/** Full metal wordmark on light field — primary default */
export const DEFAULT_LOGO_URL = `${base}images/engage-logo-metal-light.jpg`;

/** Full metal wordmark on dark field */
export const DEFAULT_LOGO_DARK_URL = `${base}images/engage-logo-metal-dark.jpg`;

/** Alias used by some legacy references */
export const DEFAULT_LOGO_JPG = `${base}images/engage-logo.jpg`;

/**
 * Pick light vs dark metal mark. Pass `isDark` from theme store / media query.
 * Always prefer a tenant-uploaded logo when provided.
 */
export function resolveBrandLogo(opts?: {
  tenantLogo?: string | null;
  isDark?: boolean;
}): string {
  if (opts?.tenantLogo) return opts.tenantLogo;
  return opts?.isDark ? DEFAULT_LOGO_DARK_URL : DEFAULT_LOGO_URL;
}
