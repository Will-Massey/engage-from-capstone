/**
 * Base-path-aware default brand logo.
 *
 * The app is served under a base path in production (`/engage/`), so an
 * absolute `/capstone-logo.jpg` resolves to the domain root and 404s. Using
 * `import.meta.env.BASE_URL` keeps the URL correct in every environment, and
 * the SVG asset is crisp at any size (the old JPG also wasn't deployed at the
 * base path). Tenants with an uploaded logo override this.
 */
export const DEFAULT_LOGO_URL = `${import.meta.env.BASE_URL}images/engage-logo.svg`;
