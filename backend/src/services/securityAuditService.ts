/**
 * Structured security event logging for SOC 2 CC7.2 monitoring.
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_LOCKED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_REQUIRED_BLOCKED'
  | 'SESSION_REVOKED'
  | 'CSRF_REJECTED';

export interface SecurityEventInput {
  type: SecurityEventType;
  userId?: string;
  tenantId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

function clientIp(req?: { ip?: string; headers?: Record<string, unknown> }): string | undefined {
  if (!req) return undefined;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  return req.ip;
}

export function securityEventFromRequest(
  req: { ip?: string; headers?: Record<string, unknown> },
  input: Omit<SecurityEventInput, 'ip' | 'userAgent'>
): SecurityEventInput {
  const ua = req.headers?.['user-agent'];
  return {
    ...input,
    ip: clientIp(req),
    userAgent: typeof ua === 'string' ? ua.slice(0, 500) : undefined,
  };
}

export async function logSecurityEvent(event: SecurityEventInput): Promise<void> {
  const payload = {
    type: event.type,
    userId: event.userId,
    tenantId: event.tenantId,
    email: event.email,
    ip: event.ip,
    userAgent: event.userAgent,
    ...event.metadata,
  };

  logger.info(`[security] ${event.type}`, payload);

  if (event.tenantId) {
    try {
      await prisma.activityLog.create({
        data: {
          tenantId: event.tenantId,
          userId: event.userId,
          action: `SECURITY_${event.type}`,
          entityType: 'SECURITY',
          entityId: event.userId || event.email || 'anonymous',
          description: `Security event: ${event.type}`,
          metadata: JSON.stringify(payload),
        },
      });
    } catch (err) {
      logger.warn('Failed to persist security event to activity log', err);
    }
  }
}

/** Privileged roles that must enable MFA when REQUIRE_MFA_FOR_PRIVILEGED=true (production default). */
export const PRIVILEGED_MFA_ROLES = new Set(['ADMIN', 'PARTNER', 'MD']);

export function isMfaRequiredForRole(role: string): boolean {
  if (process.env.REQUIRE_MFA_FOR_PRIVILEGED === 'false') return false;
  if (process.env.NODE_ENV !== 'production' && process.env.REQUIRE_MFA_FOR_PRIVILEGED !== 'true') {
    return false;
  }
  return PRIVILEGED_MFA_ROLES.has(role);
}