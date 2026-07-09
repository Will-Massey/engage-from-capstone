import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import stripeWebhookRoutes from '../routes/stripeWebhook.js';
import stripeConnectWebhookRoutes from '../routes/webhooks/stripeConnect.js';
import logger from '../utils/logger.js';

// Body parsing — SendGrid webhook needs raw body for signature verification
import sendgridWebhookRoutes from '../routes/webhooks/sendgrid.js';
import emailEventsWebhookRoutes from '../routes/webhooks/email-events.js';

import cloudflareEmailWebhookRoutes from '../routes/webhooks/cloudflare-email.js';

export function applyParsersAndWebhooks(app: express.Express): void {
  // Logging
  app.use(
    morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    })
  );

  // Cookie parsing (required for CSRF and auth cookies)
  app.use(cookieParser());

  // Stripe webhook must receive raw body — mount before express.json()
  app.use('/api/payments/webhook', stripeWebhookRoutes);
  app.use('/api/webhooks/stripe-connect', stripeConnectWebhookRoutes);

  // Revolut billing webhook — raw body for HMAC verification (handler mounted with /api/billing below)
  app.use(
    '/api/billing/webhook',
    express.json({
      limit: '64kb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  app.use(
    '/api/webhooks/sendgrid',
    express.raw({ type: 'application/json' }),
    (req, _res, next) => {
      const buf = req.body as Buffer;
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      try {
        req.body = JSON.parse(buf.toString('utf8'));
      } catch {
        req.body = [];
      }
      next();
    },
    sendgridWebhookRoutes
  );

  app.use('/api/webhooks/email-events', emailEventsWebhookRoutes);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api/webhooks/cloudflare-email', cloudflareEmailWebhookRoutes);
}
