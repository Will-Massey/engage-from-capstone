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
          scriptSrc: [
            "'self'",
            'https://sandbox-checkout.revolut.com',
            'https://checkout.revolut.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: [
            "'self'",
            process.env.FRONTEND_URL || 'http://localhost:5173',
            'https://sandbox-merchant.revolut.com',
            'https://merchant.revolut.com',
            'https://sandbox-checkout.revolut.com',
            'https://checkout.revolut.com',
          ],
          frameSrc: [
            "'self'",
            'https://sandbox-checkout.revolut.com',
            'https://checkout.revolut.com',
          ],
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
