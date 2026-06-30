/**
 * SendGrid Event Webhook — delivery status + suppression handling
 */

import { Router, Request, Response } from 'express';
import { EventWebhook } from '@sendgrid/eventwebhook';
import logger from '../../config/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { processEmailDeliveryEvent } from '../../services/emailDeliveryService.js';

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
      const proposalId = evt.proposalId || evt.custom_args?.proposalId;
      const eventType = evt.event as string;

      await processEmailDeliveryEvent({
        emailLogId,
        tenantId,
        proposalId,
        email: evt.email,
        event: eventType,
        reason: evt.reason || evt.response,
        messageId: evt.sg_message_id,
        metadata: {
          sgEventId: evt.sg_event_id,
          timestamp: evt.timestamp,
          source: 'sendgrid-webhook',
        },
      });
    }

    res.status(200).json({ success: true });
  })
);

export default router;