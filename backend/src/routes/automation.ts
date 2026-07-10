import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import { runEmailAutomation, testEmailAutomation } from '../jobs/emailAutomation.js';
import { runProposalChaseJob } from '../jobs/proposalChaseJob.js';
import logger from '../config/logger.js';
import { prisma } from '../config/database.js';
import { getProposalSettings } from '../utils/tenantProposalSettings.js';

const router = Router();

/**
 * POST /api/automation/email-followup/run
 * Manually trigger the email follow-up automation job
 * Admin only
 */
router.post(
  '/email-followup/run',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    logger.info('Manual email automation triggered by user:', req.user!.id);

    const result = await runEmailAutomation();

    res.json({
      success: result.success,
      data: {
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
      },
      message: result.success
        ? `Email automation completed: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`
        : 'Email automation failed or not configured',
    });
  })
);

/**
 * POST /api/automation/email-followup/test/:proposalId
 * Test email follow-up for a specific proposal
 * Admin only
 */
router.post(
  '/email-followup/test/:proposalId',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const { proposalId } = req.params;

    logger.info(`Test email follow-up triggered for proposal ${proposalId} by user:`, req.user!.id);

    const tenantId = req.tenantId!;
    const success = await testEmailAutomation(proposalId, tenantId);

    if (!success) {
      throw new ApiError(
        'EMAIL_FAILED',
        'Failed to send test follow-up email. Check logs for details.',
        500
      );
    }

    res.json({
      success: true,
      message: 'Test follow-up email sent successfully',
    });
  })
);

/**
 * GET /api/automation/settings
 * Get automation settings for the tenant
 */
router.get(
  '/settings',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const proposalSettings = getProposalSettings(tenant?.settings);

    res.json({
      success: true,
      data: {
        proposalChase: {
          enabled: proposalSettings.chaseSequenceEnabled,
          schedule: '0 9 * * *',
          chaseSequenceDays: proposalSettings.chaseSequenceDays,
        },
        emailFollowUp: {
          enabled: proposalSettings.chaseSequenceEnabled,
          schedule: '0 9 * * *',
          stages: proposalSettings.chaseSequenceDays.map((daysAfterSend) => ({
            daysAfterSend,
            template: daysAfterSend >= 14 ? 'urgent' : 'gentle',
          })),
        },
        proposalExpiry: {
          enabled: true,
          defaultExpiryDays: proposalSettings.defaultExpiryDays,
          reminderDaysBefore: proposalSettings.renewalReminderDays,
        },
      },
    });
  })
);

/**
 * POST /api/automation/proposal-chase/run
 * Manually trigger the proposal chase job (admin/partner)
 */
router.post(
  '/proposal-chase/run',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    logger.info('Manual proposal chase triggered by user:', req.user!.id);
    const result = await runProposalChaseJob();
    res.json({
      success: result.success,
      data: { sent: result.sent, failed: result.failed, skipped: result.skipped },
      message: `Proposal chase completed: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
    });
  })
);

export default router;
