import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { approveAndSendTouchpoint } from '../jobs/touchpointEngine.js';
import logger from '../config/logger.js';

const router = Router();

router.use(authenticate);

const StageEnum = z.enum([
  'PROPOSAL_ACCEPTED', 'AML_PENDING', 'AML_COMPLETE', 'ENGAGEMENT_LETTER_SENT',
  'ENGAGEMENT_LETTER_SIGNED', 'INFO_REQUESTED', 'INFO_RECEIVED', 'ONBOARDING_SETUP',
  'KICKOFF_SENT', 'MILESTONE_CHECK_IN', 'SATISFACTION_CHECK', 'ONGOING', 'ANNUAL_REVIEW',
]);

const ToneEnum = z.enum(['WARM', 'NEUTRAL', 'URGENT']);

const ChannelEnum = z.enum(['EMAIL', 'SMS', 'IN_APP']);

// List templates for current tenant (per-stage editor data)
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const templates = await prisma.touchpointTemplate.findMany({
      where: { tenantId },
      orderBy: { stage: 'asc' },
    });

    res.json({ success: true, data: templates });
  })
);

// Create or update a template for a stage
router.put(
  '/templates/:stage',
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const { stage } = req.params;

    const schema = z.object({
      subject: z.string().min(3),
      body: z.string().min(10),
      tone: ToneEnum.default('WARM'),
      isMarketing: z.boolean().default(false),
      isActive: z.boolean().default(true),
    });

    const data = schema.parse(req.body);

    const template = await prisma.touchpointTemplate.upsert({
      where: { tenantId_stage: { tenantId, stage: stage as any } },
      update: data,
      create: {
        tenantId,
        stage: stage as any,
        ...data,
      } as any,
    });

    res.json({ success: true, data: template });
  })
);

// Get pending human-approval queue
router.get(
  '/approvals',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const pending = await prisma.touchpoint.findMany({
      where: {
        tenantId,
        requiresHumanApproval: true,
        status: 'PENDING',
      },
      include: {
        client: { select: { id: true, name: true, contactEmail: true } },
        template: { select: { subject: true, tone: true } },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    res.json({ success: true, data: pending });
  })
);

// Approve + send a gated touchpoint
router.post(
  '/:id/approve',
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.user!.id;

    const ok = await approveAndSendTouchpoint(id, tenantId, userId);

    if (!ok) {
      throw new ApiError('BAD_REQUEST', 'Could not approve touchpoint (not pending or not gated)', 400);
    }

    res.json({ success: true });
  })
);

// Pause / resume all touchpoints for a client + set marketing consent
const clientOverrideSchema = z.object({
  touchpointsPaused: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  lifecycleStage: StageEnum.optional(),
});

router.patch(
  '/clients/:clientId',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;

    const data = clientOverrideSchema.parse(req.body);

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data,
    });

    res.json({ success: true, data: updated });
  })
);

// Manually trigger engine (useful for testing)
router.post(
  '/run',
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (_req, res) => {
    const { runTouchpointEngine } = await import('../jobs/touchpointEngine.js');
    const stats = await runTouchpointEngine();
    res.json({ success: true, data: stats });
  })
);

// List touchpoints for a specific client (upcoming + history)
router.get(
  '/client/:clientId',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;

    const touchpoints = await prisma.touchpoint.findMany({
      where: { clientId, tenantId },
      include: {
        template: { select: { subject: true, body: true, tone: true } },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 20,
    });

    res.json({ success: true, data: touchpoints });
  })
);

export default router;
