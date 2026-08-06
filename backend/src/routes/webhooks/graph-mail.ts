/**
 * Microsoft Graph mailbox webhook receiver — the accelerator for the
 * scheduled delta sync (mailboxSyncJob.ts remains the guarantee).
 *
 * Handles the Graph subscription validation handshake (echo validationToken
 * as text/plain 200) and change notifications: each notification's
 * clientState is matched against MailboxSyncState to resolve the tenant,
 * then syncMailbox(tenantId) is fired without waiting for it so the ack stays
 * fast. No auth middleware (external caller) — CSRF-exempt like
 * /api/webhooks/cloudflare-email.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import logger from '../../config/logger.js';
import { prisma } from '../../config/database.js';
import { syncMailbox } from '../../services/mailboxService.js';

const router = Router();

interface GraphChangeNotification {
  subscriptionId?: string;
  clientState?: string;
  resource?: string;
  changeType?: string;
}

interface GraphNotificationPayload {
  value?: GraphChangeNotification[];
}

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // Graph subscription validation handshake.
    const validationToken = req.query.validationToken;
    if (typeof validationToken === 'string') {
      res.status(200).type('text/plain').send(validationToken);
      return;
    }

    const body = req.body as GraphNotificationPayload;
    const notifications = Array.isArray(body?.value) ? body.value : [];

    for (const notification of notifications) {
      const clientState = notification?.clientState;
      if (!clientState) {
        logger.warn('Graph mail webhook: notification missing clientState — dropped');
        continue;
      }

      // Graph disables a subscription that repeatedly gets a non-2xx
      // response, so a lookup failure (DB hiccup) must never bubble into a
      // 500 — log and drop the notification, still ack 202 below.
      try {
        const syncState = await prisma.mailboxSyncState.findFirst({ where: { clientState } });
        if (!syncState) {
          logger.warn('Graph mail webhook: no tenant matched clientState — dropped');
          continue;
        }

        // Fire-and-forget: ack fast, don't block the webhook response on the sync.
        syncMailbox(syncState.tenantId).catch((e: unknown) => {
          logger.error(`Graph mail webhook: sync failed for tenant ${syncState.tenantId}`, e);
        });
      } catch (e) {
        logger.warn('Graph mail webhook: clientState lookup failed — notification dropped', e);
      }
    }

    res.status(202).json({ success: true });
  })
);

export default router;
