import type { Request } from 'express';
import logger from './logger.js';

export type OpsAuditAction =
  | 'admin.migrate'
  | 'admin.fix-schema'
  | 'admin.db-status'
  | 'setup.root'
  | 'setup.migrate-pricing'
  | 'setup.clear-login-lockout'
  | 'setup.seed-tenant-library'
  | 'health.migrate-data';

/**
 * Audit log for break-glass admin/setup endpoints (IP + action, never log secrets).
 */
export function logOpsAccess(
  req: Request,
  action: OpsAuditAction,
  meta?: Record<string, unknown>
): void {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : null) || req.ip;

  logger.info('[ops-audit]', {
    action,
    ip,
    method: req.method,
    path: req.path,
    ...meta,
  });
}
