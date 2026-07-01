import type { Plugin } from 'vite';

/**
 * Injects the current ISO build timestamp into index.html meta[name="build-time"].
 */
export function injectBuildTime(): Plugin {
  return {
    name: 'inject-build-time',
    transformIndexHtml(html) {
      const buildTime = new Date().toISOString();
      if (html.includes('name="build-time"')) {
        return html.replace(
          /<meta\s+name="build-time"\s+content="[^"]*"\s*\/?>/i,
          `<meta name="build-time" content="${buildTime}" />`
        );
      }
      return html.replace('</head>', `    <meta name="build-time" content="${buildTime}" />\n  </head>`);
    },
  };
}