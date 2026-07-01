/**
 * W4.5 — Public status page API (no auth).
 */

import { Router } from 'express';
import { checkDatabaseHealth } from '../config/database.js';
import { isXeroOAuthConfigured } from '../services/tenantXeroSettings.js';
import { isQuickBooksOAuthConfigured } from '../services/tenantQuickbooksSettings.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

type ComponentStatus = 'operational' | 'degraded' | 'unavailable' | 'not_configured';

function emailStatus(): { status: ComponentStatus; detail: string } {
  if (process.env.SENDGRID_API_KEY) {
    return { status: 'operational', detail: 'SendGrid configured' };
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return { status: 'operational', detail: 'SMTP configured' };
  }
  return {
    status: 'degraded',
    detail: 'No email provider configured (SENDGRID_API_KEY or SMTP)',
  };
}

function xeroStatus(): { status: ComponentStatus; detail: string } {
  if (isXeroOAuthConfigured()) {
    return { status: 'operational', detail: 'Xero OAuth credentials present' };
  }
  return { status: 'not_configured', detail: 'Xero OAuth not configured on server' };
}

function quickbooksStatus(): { status: ComponentStatus; detail: string } {
  if (isQuickBooksOAuthConfigured()) {
    return { status: 'operational', detail: 'QuickBooks OAuth credentials present' };
  }
  return { status: 'not_configured', detail: 'QuickBooks OAuth not configured on server' };
}

function overallFrom(components: ComponentStatus[]): 'operational' | 'degraded' | 'major_outage' {
  if (components.includes('unavailable')) return 'major_outage';
  if (components.includes('degraded')) return 'degraded';
  return 'operational';
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const db = await checkDatabaseHealth();
    const email = emailStatus();
    const xero = xeroStatus();
    const quickbooks = quickbooksStatus();

    const components = {
      api: { status: 'operational' as ComponentStatus, detail: 'Engage API responding' },
      database: {
        status: (db.healthy ? 'operational' : 'unavailable') as ComponentStatus,
        detail: db.healthy ? 'PostgreSQL connected' : db.error || 'Database unavailable',
      },
      email,
      xero,
      quickbooks,
    };

    const overall = overallFrom([
      components.database.status,
      components.email.status,
      components.api.status,
    ]);

    const httpStatus = overall === 'major_outage' ? 503 : 200;

    res.status(httpStatus).json({
      success: true,
      data: {
        status: overall,
        components,
        version: process.env.npm_package_version || 'unknown',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

export default router;