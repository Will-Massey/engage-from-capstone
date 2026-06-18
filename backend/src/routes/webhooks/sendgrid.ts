/**
 * SendGrid Event Webhook — delivery status + suppression handling
 */

import { Router, Request, Response } from 'express';
import { EventWebhook } from '@sendgrid/eventwebhook';
import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

function verifySendGridSignature(req: Request): boolean {
  const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
  if (!verificationKey) {
    // Allow in development when key not set
    return process.env.NODE_ENV !== 'production';
  }

  try {
    const ew = new EventWebhook();
    const ecPublicKey = ew.convertPublicKeyToECDSA(verificationKey);
    const signature = req.get('X-Twilio-Email-Event-Webhook-Signature') || '';
    const timestamp = req.get('X-Twilio-Email-Event-Webhook-Timestamp') || '';
    const payload = (req as Request & { rawBody?: Buffer }).rawBody || Buffer.from('');
    return ew.verifySignature(ecPublicKey, payload, signature, timestamp);
  } catch (error) {
    logger.error('SendGrid webhook signature verification failed:', error);
    return false;
  }
}

function mapEventToStatus(event: string): string | null {
  switch (event) {
    case 'delivered':
      return 'DELIVERED';
    case 'bounce':
    case 'dropped':
      return 'BOUNCED';
    case 'spamreport':
    case 'unsubscribe':
      return 'SUPPRESSED';
    default:
      return null;
  }
}

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!verifySendGridSignature(req)) {
      res.status(401).json({ success: false, error: 'Invalid signature' });
      return;
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const evt of events) {
      const emailLogId = evt.emailLogId || evt.custom_args?.emailLogId;
      const tenantId = evt.tenantId || evt.custom_args?.tenantId;
      const eventType = evt.event as string;
      const status = mapEventToStatus(eventType);

      if (emailLogId && status) {
        await prisma.emailLog.updateMany({
          where: { id: emailLogId },
          data: {
            status: status as any,
            error: evt.reason || evt.response || undefined,
            metadata: JSON.stringify({
              event: eventType,
              sgEventId: evt.sg_event_id,
              timestamp: evt.timestamp,
            }),
          },
        });
      }

      const shouldSuppress =
        tenantId &&
        evt.email &&
        (eventType === 'bounce' || eventType === 'spamreport' || eventType === 'unsubscribe');

      if (shouldSuppress) {
        const email = String(evt.email).toLowerCase().trim();
        await prisma.emailSuppression.upsert({
          where: { tenantId_email: { tenantId, email } },
          create: {
            tenantId,
            email,
            reason: eventType,
          },
          update: { reason: eventType },
        });
        logger.info(`Suppressed ${email} for tenant ${tenantId} (${eventType})`);
      }
    }

    res.status(200).json({ success: true });
  })
);

export default router;
