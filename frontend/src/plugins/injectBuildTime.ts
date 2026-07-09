import type { Plugin } from 'vite';

/**
 * Injects the current ISO build timestamp into index.html meta[name="build-time"].
 */
function productionCspMeta(): string {
  const apiOrigin = (process.env.VITE_API_URL || 'https://capstonesoftware.co.uk/engage')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');

  const connectSrc = [
    "'self'",
    apiOrigin,
    'https://engage-backend-e1ue.onrender.com',
    'https://api.stripe.com',
    'https://checkout.stripe.com',
  ].join(' ');

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
