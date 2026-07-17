/**
 * Clara agentic drafting routes (R5.1)
 * POST /api/clara/run-drafting — run this tenant's drafting pass now (senior roles)
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { runClaraDraftingForTenant } from '../services/claraAgenticService.js';

const router = Router();

router.post(
  '/run-drafting',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const result = await runClaraDraftingForTenant(req.tenantId!);
    res.json({
      success: true,
      data: result,
      message: result.enabled
        ? `Clara drafted ${result.signalDrafts + result.renewalDrafts} proposal(s) for approval`
        : 'Clara autopilot is switched off for this practice',
    });
  })
);

export default router;
