import express from 'express';
import helmet from 'helmet';

// Security middleware - CSP configured for production
export function applySecurity(app: express.Express): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // No 'unsafe-inline' — the API serves no inline scripts, so this keeps
          // CSP's XSS protection intact for any HTML the backend renders.
          scriptSrc: ["'self'"],
          // style-src keeps 'unsafe-inline': the platform's rendered HTML (emails,
          // PDF previews) relies on inline <style>/style="" attributes. script-src
          // stays locked to 'self' (no 'unsafe-inline'/'unsafe-eval'), which is where
          // the real XSS protection lives.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173'],
          frameSrc: ["'self'"],
          // Block this API's responses from being framed anywhere (clickjacking).
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      // HSTS - HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
      // Additional security headers
      hidePoweredBy: true,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    })
  );
}
