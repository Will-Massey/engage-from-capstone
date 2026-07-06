/**
 * Cloudflare / generic email event webhook stub.
 * Logs bounces/opens and updates proposal emailHistory when messageId matches.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { secureCompare } from '../../utils/secureCompare.js';
import { isProduction } from '../../utils/securityFlags.js';

const router = Router();

/** Accepts `Authorization: Bearer <secret>` or `X-Webhook-Secret: <secret>`. */
function requireWebhookAuth(headers: { [key: string]: string | string[] | undefined }): void {
  const secret = process.env.EMAIL_WEBHOOK_SECRET || process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET;

  if (!secret) {
    if (isProduction) {
      throw new ApiError('WEBHOOK_NOT_CONFIGURED', 'Email webhook is not configured', 503);
    }
    return; // dev/test without a secret — allow (local stub)
  }

  const auth = headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const headerRaw = headers['x-webhook-secret'];
  const provided = bearer ?? (Array.isArray(headerRaw) ? headerRaw[0] : headerRaw);

  if (!secureCompare(provided, secret)) {
    throw new ApiError('UNAUTHORIZED', 'Invalid email webhook credentials', 401);
  }
}

const eventSchema = z.object({
  messageId: z.string().optional(),
  event: z.string().optional(),
  status: z.string().optional(),
  to: z.string().email().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  proposalId: z.string().optional(),
  tenantId: z.string().optional(),
  type: z.enum(['open', 'bounce', 'delivered', 'click', 'spam', 'unsubscribe']).optional(),
});

function normaliseEvent(body: z.infer<typeof eventSchema>): {
  messageId?: string;
  eventType: string;
  to?: string;
  timestamp?: string;
  proposalId?: string;
} {
  const eventType = (body.type || body.event || body.status || 'unknown').toLowerCase();
  return {
    messageId: body.messageId,
    eventType,
    to: body.to,
    timestamp: body.timestamp != null ? String(body.timestamp) : undefined,
    proposalId: body.proposalId,
    // tenantId is intentionally NOT surfaced — attribution derives from the proposal.
  };
}

/**
 * Applies the event to the proposal's email history and returns the proposal's
 * OWN tenantId (authoritative) — so callers attribute activity to the real
 * owning tenant rather than a tenantId supplied in the webhook body.
 */
async function updateProposalEmailHistory(
  proposalId: string,
  patch: Record<string, unknown>
): Promise<string | null> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { tenantId: true, emailHistory: true },
  });
  if (!proposal) return null;

  let history: Array<Record<string, unknown>> = [];
  try {
    history = JSON.parse(proposal.emailHistory || '[]');
  } catch {
    history = [];
  }

  const messageId = patch.messageId as string | undefined;
  let updated = false;

  if (messageId) {
    for (const entry of history) {
      if (entry.messageId === messageId) {
        Object.assign(entry, patch);
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    history.push({ ...patch, recordedAt: new Date().toISOString() });
  }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { emailHistory: JSON.stringify(history) },
  });

  return proposal.tenantId;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    requireWebhookAuth(req.headers);

    const events = Array.isArray(req.body) ? req.body : [req.body];
    const processed: string[] = [];

    for (const raw of events) {
      const parsed = eventSchema.safeParse(raw);
      if (!parsed.success) continue;

      const evt = normaliseEvent(parsed.data);
      logger.info('Email webhook event received', evt);

      // Attribute the event to the proposal's real owner — never the body's
      // tenantId. If no proposal matches, we cannot safely attribute a tenant,
      // so we skip the DB activity log (the event is still logged above).
      let authoritativeTenantId: string | null = null;

      if (evt.proposalId) {
        try {
          authoritativeTenantId = await updateProposalEmailHistory(evt.proposalId, {
            messageId: evt.messageId,
            lastEvent: evt.eventType,
            lastEventAt: new Date().toISOString(),
            to: evt.to,
            ...(evt.eventType === 'bounce' || evt.eventType === 'spam' ? { bounced: true } : {}),
            ...(evt.eventType === 'open'
              ? { opened: true, openedAt: new Date().toISOString() }
              : {}),
          });
        } catch (e) {
          logger.warn('Failed to update proposal emailHistory', e);
        }
      }

      if (authoritativeTenantId) {
        try {
          await prisma.activityLog.create({
            data: {
              tenantId: authoritativeTenantId,
              action: 'EMAIL_WEBHOOK_EVENT',
              entityType: 'EMAIL',
              entityId: evt.proposalId,
              proposalId: evt.proposalId,
              description: `${evt.eventType} for ${evt.to || evt.messageId || 'unknown recipient'}`,
              metadata: JSON.stringify(evt),
            },
          });
        } catch (e) {
          logger.warn('Failed to log email webhook activity', e);
        }
      }

      if (evt.messageId && (evt.eventType === 'bounce' || evt.eventType === 'spam')) {
        try {
          await prisma.emailLog.updateMany({
            where: { externalId: evt.messageId },
            data: {
              status: 'BOUNCED',
              error: evt.eventType,
            },
          });
        } catch {
          // best-effort
        }
      }

      processed.push(evt.eventType);
    }

    res.json({ success: true, received: true, processed: processed.length });
  })
);

export default router;
