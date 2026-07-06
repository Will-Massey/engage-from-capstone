/**
 * Third-party integration endpoints (stubs and handoffs).
 * Xero/QB mandate draft — deferred (user completing separately).
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(authenticate);

/** AccountFlow handoff — service unavailable until AccountFlow is live */
router.get(
  '/accountflow/handoff',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: {
        available: false,
        status: 'coming_soon',
        message:
          'AccountFlow handoff will activate automatically once the AccountFlow service is available. Your accepted proposals are ready when integration goes live.',
      },
    });
  })
);

/** Xero/QB mandate draft — placeholder; full implementation in progress */
router.get(
  '/xero/status',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: {
        connected: false,
        status: 'in_progress',
        message: 'Xero mandate draft integration is being finalised.',
      },
    });
  })
);

export default router;
