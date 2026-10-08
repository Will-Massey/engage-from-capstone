/**
 * The client ID / AML upload page uses the client's portal token:
 *   portal:      {origin}{base}/portal/{token}
 *   AML upload:  {origin}{base}/onboarding/aml/{token}
 * (the same URL the welcome touchpoint emails as {{aml_portal_link}}).
 * Returns null when the input is not a portal URL.
 */
export function amlUploadUrlFromPortalUrl(portalUrl: string | null | undefined): string | null {
  if (!portalUrl) return null;
  const match = portalUrl.match(/^(.*)\/portal\/([^/?#]+)([?#].*)?$/);
  if (!match) return null;
  return `${match[1]}/onboarding/aml/${match[2]}`;
}
