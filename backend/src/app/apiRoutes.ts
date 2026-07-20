import express from 'express';

// Import routes
import companiesHouseRoutes from '../routes/companiesHouse.js';
import proposalRoutes from '../routes/proposals.js';
import proposalShareRoutes from '../routes/proposals-share.js';
import clientRoutes from '../routes/clients.js';
import serviceRoutes from '../routes/services.js';
import enhancedServiceRoutes from '../routes/services-new.js';
import tenantRoutes from '../routes/tenants.js';
import emailRoutes from '../routes/email.js';
import paymentRoutes from '../routes/payments.js';
import billingRoutes from '../routes/billing.js';
import payoutRoutes from '../routes/payout.js';
import coverLetterTemplateRoutes from '../routes/coverLetterTemplates.js';
// NB: routes/proposalTemplates.ts (full CRUD + library provisioning), not the
// GET-only routes/proposal-templates.ts that shadowed it — see its deletion.
import proposalTemplateRoutes from '../routes/proposalTemplates.js';
import engagementLibraryRoutes from '../routes/engagementLibrary.js';
import analyticsRoutes from '../routes/analytics.js';
import touchpointRoutes from '../routes/touchpoints.js';
import onboardingRoutes from '../routes/onboarding.js';
import aiRoutes from '../routes/ai.js';
import automationRoutes from '../routes/automation.js';
import uploadsRoutes from '../routes/uploads.js';
import integrationsRoutes from '../routes/integrations.js';
import xeroRoutes from '../routes/xero.js';
import amlRoutes from '../routes/aml.js';
import regulatoryRoutes from '../routes/regulatory.js';
import claraRoutes from '../routes/clara.js';
import quickbooksRoutes from '../routes/quickbooks.js';
import statusRoutes from '../routes/status.js';
import notificationsRoutes from '../routes/notifications.js';

// Import middleware
import { extractTenant } from '../middleware/tenant.js';

// API routes (auth already mounted above)
// Share/portal/public routes first (before authenticated /:id handlers)
export function mountApiRoutes(app: express.Express): void {
  app.use('/api/proposals', proposalShareRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/aml', amlRoutes); // authenticate sets req.tenantId; /webhook is public + secret-gated
  app.use('/api/proposals', extractTenant, proposalRoutes);
  app.use('/api/clients', extractTenant, clientRoutes);
  app.use('/api/services', extractTenant, serviceRoutes);
  app.use('/api/services/v2', extractTenant, enhancedServiceRoutes);
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/email', extractTenant, emailRoutes);
  app.use('/api/payments', extractTenant, paymentRoutes);
  app.use('/api/billing', extractTenant, billingRoutes);
  app.use('/api/payout', extractTenant, payoutRoutes);
  app.use('/api/companies-house', extractTenant, companiesHouseRoutes);
  app.use('/api/cover-letter-templates', extractTenant, coverLetterTemplateRoutes);
  app.use('/api/proposal-templates', extractTenant, proposalTemplateRoutes);
  app.use('/api/engagement-library', extractTenant, engagementLibraryRoutes);
  app.use('/api/analytics', extractTenant, analyticsRoutes);
  app.use('/api/regulatory', extractTenant, regulatoryRoutes);
  app.use('/api/clara', extractTenant, claraRoutes);
  app.use('/api/touchpoints', extractTenant, touchpointRoutes);
  app.use('/api/automation', extractTenant, automationRoutes);
  app.use('/api/uploads', extractTenant, uploadsRoutes);
  app.use('/api/ai', extractTenant, aiRoutes);
  app.use('/api/integrations', extractTenant, integrationsRoutes);
  // xeroRoutes/quickbooksRoutes were imported but never mounted — the settings
  // pages call /api/xero/* and /api/quickbooks/* directly (404 until now).
  app.use('/api/xero', extractTenant, xeroRoutes);
  app.use('/api/quickbooks', extractTenant, quickbooksRoutes);
  app.use('/api/notifications', extractTenant, notificationsRoutes);

  // W4.5 — Public status page API (no auth)
  app.use('/api/status', statusRoutes);
}
