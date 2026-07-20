/**
 * Header notification feed.
 * GET /api/notifications — recent client-driven events for the tenant,
 * sourced from the ActivityLog (read-only; the bell in the app header).
 */
import { Router } from 'express';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/** Client-driven events worth surfacing to staff — not internal/system noise. */
export const NOTIFICATION_ACTIONS = [
  'PROPOSAL_VIEWED',
  'PROPOSAL_SIGNED',
  'PROPOSAL_ACCEPTED',
  'PROPOSAL_DECLINED',
  'PROPOSAL_SENT',
  'PROPOSAL_SUBMITTED_FOR_APPROVAL',
  'CLIENT_AML_SUBMITTED',
  'CLIENT_INFO_RECEIVED',
  'AML_CHECK_COMPLETED',
  'PAYMENT_COMPLETED',
  'PROPOSAL_CHASE_SENT',
  'REGULATORY_SIGNAL_RAISED',
];

const router = Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const items = await prisma.activityLog.findMany({
      where: {
        tenantId: req.tenantId,
        action: { in: NOTIFICATION_ACTIONS },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        description: true,
        entityType: true,
        entityId: true,
        proposalId: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: items });
  })
);

export default router;
