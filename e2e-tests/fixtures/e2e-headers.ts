/** Shared Playwright extraHTTPHeaders — production CORS requires Origin on API calls. */
export function e2eExtraHeaders(mode: 'e2e-build' | 'e2e' = 'e2e-build'): Record<string, string> {
  const frontend = (process.env.FRONTEND_URL || 'https://capstonesoftware.co.uk/engage').replace(
    /\/$/,
    ''
  );
  return {
    'X-Test-Mode': mode,
    Origin: new URL(frontend).origin,
    // Production ignores X-Test-Mode unless this matches E2E_BYPASS_SECRET on the server
    ...(process.env.E2E_BYPASS_SECRET
      ? { 'X-Test-Mode-Secret': process.env.E2E_BYPASS_SECRET }
      : {}),
  };
}
