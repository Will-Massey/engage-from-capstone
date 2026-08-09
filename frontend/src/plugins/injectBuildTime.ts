import type { Plugin } from 'vite';

/**
 * The API's origin — scheme and host only, never a path.
 *
 * A CSP source expression carrying a path is matched by the *exact* path unless
 * it ends in "/", so `https://capstonesoftware.co.uk/engage` permits only that
 * one URL and blocks `/engage/api/...` — every call the app actually makes.
 *
 * On the web this is invisible: the SPA is served from the same host, so
 * `'self'` already covers the API. The Capacitor shell is served from
 * `capacitor://localhost`, which makes the API cross-origin, so it must match a
 * listed source. It did not, and WebKit blocked every request before it reached
 * the network — surfacing in the app as an unexplained "Network error" on
 * sign-in, while curl against the same endpoint succeeded.
 */
export function apiConnectSource(rawUrl: string | undefined): string {
  const raw = rawUrl || 'https://capstonesoftware.co.uk/engage';
  try {
    return new URL(raw).origin;
  } catch {
    // Not absolute (e.g. a bare "/engage" proxy path) — same-origin, so 'self'
    // already covers it and there is nothing to add.
    return '';
  }
}

/**
 * Injects the current ISO build timestamp into index.html meta[name="build-time"].
 */
function productionCspMeta(): string {
  const apiOrigin = apiConnectSource(process.env.VITE_API_URL);

  const connectSrc = [
    "'self'",
    apiOrigin,
    'https://engage-backend-e1ue.onrender.com',
    'https://api.stripe.com',
    'https://checkout.stripe.com',
  ]
    .filter(Boolean)
    .join(' ');

  const policy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSrc}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
  ].join('; ');

  return `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
}

export function injectBuildTime(): Plugin {
  return {
    name: 'inject-build-time',
    transformIndexHtml(html, ctx) {
      const buildTime = new Date().toISOString();
      let result = html;
      if (html.includes('name="build-time"')) {
        result = html.replace(
          /<meta\s+name="build-time"\s+content="[^"]*"\s*\/?>/i,
          `<meta name="build-time" content="${buildTime}" />`
        );
      } else {
        result = html.replace(
          '</head>',
          `    <meta name="build-time" content="${buildTime}" />\n  </head>`
        );
      }

      if (!ctx.server) {
        result = result.replace('</head>', `    ${productionCspMeta()}\n  </head>`);
      }

      return result;
    },
  };
}
