import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { mintRealtimeClientSecret } from '../services/voice/xaiClient.js';
import { runVoiceTool } from '../services/voice/pendingChange.js';
import { voiceSessionUpdate } from '../services/voice/sessionTools.js';
import {
  COST_BASIS,
  usdPerMinute,
  XAI_REALTIME_URL,
  XAI_VOICE_MODEL,
} from '../services/voice/xaiConfig.js';
import {
  assertDailyCap,
  closeStaleVoiceSessions,
  groupUsage,
  recordVoiceUsage,
} from '../services/voice/voiceUsage.js';

const router = Router();

async function actorFromRequest(req: {
  user?: { id: string; firstName?: string; lastName?: string };
  tenantId?: string;
}) {
  if (!req.user || !req.tenantId) throw new ApiError('UNAUTHORIZED', 'Sign in required.', 401);
  const [user, tenant] = await Promise.all([
    prisma.user.findFirst({
      where: { id: req.user.id, tenantId: req.tenantId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        voiceAssistantEnabled: true,
        role: true,
      },
    }),
    prisma.tenant.findUnique({ where: { id: req.tenantId }, select: { id: true, name: true } }),
  ]);
  if (!user || !tenant) throw new ApiError('UNAUTHORIZED', 'Sign in required.', 401);
  return { user, tenant };
}

router.get(
  '/access',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = await actorFromRequest(req);
    res.json({ success: true, data: { enabled: user.voiceAssistantEnabled } });
  })
);

router.get(
  '/access/users',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId, isActive: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        voiceAssistantEnabled: true,
      },
      orderBy: { firstName: 'asc' },
    });
    res.json({ success: true, data: users });
  })
);

router.patch(
  '/access/:userId',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = z.object({ enabled: z.boolean() }).parse(req.body);
    const target = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!target) throw new ApiError('NOT_FOUND', 'User not found.', 404);
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { voiceAssistantEnabled: body.enabled },
      select: { id: true, voiceAssistantEnabled: true },
    });
    res.json({ success: true, data: updated });
  })
);

router.post(
  '/session',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user, tenant } = await actorFromRequest(req);
    if (!user.voiceAssistantEnabled) {
      throw new ApiError('VOICE_DISABLED', 'The assistant is not switched on for this user.', 403);
    }
    await closeStaleVoiceSessions(user.id);
    await assertDailyCap(user.id);
    const rate = usdPerMinute();
    const usage = await prisma.xaiUsage.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        lastHeartbeatAt: new Date(),
        rateUsdPerMinute: rate,
      },
    });
    try {
      const secret = await mintRealtimeClientSecret();
      const name = `${user.firstName} ${user.lastName}`.trim();
      res.json({
        success: true,
        data: {
          usageId: usage.id,
          clientSecret: secret.value,
          expiresAt: secret.expiresAt,
          websocketUrl: `${XAI_REALTIME_URL}?model=${XAI_VOICE_MODEL}`,
          model: XAI_VOICE_MODEL,
          sessionUpdate: voiceSessionUpdate(name, tenant.name),
          costBasis: COST_BASIS,
          usdPerMinute: rate,
        },
      });
    } catch (err) {
      await prisma.xaiUsage.update({
        where: { id: usage.id },
        data: { endedAt: new Date(), seconds: 0, estimatedCostUsd: 0 },
      });
      throw err;
    }
  })
);

router.post(
  '/session/:usageId/heartbeat',
  authenticate,
  asyncHandler(async (req, res) => {
    const row = await prisma.xaiUsage.findFirst({
      where: { id: req.params.usageId, userId: req.user!.id, tenantId: req.tenantId },
    });
    if (!row) throw new ApiError('NOT_FOUND', 'Voice session not found.', 404);
    if (row.endedAt) {
      res.json({ success: true, data: { open: false } });
      return;
    }
    await assertDailyCap(req.user!.id);
    await prisma.xaiUsage.update({
      where: { id: row.id },
      data: { lastHeartbeatAt: new Date() },
    });
    res.json({ success: true, data: { open: true } });
  })
);

router.post(
  '/session/:usageId/close',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ usageEvents: z.array(z.unknown()).max(200).optional() })
      .parse(req.body ?? {});
    const saved = await recordVoiceUsage(req.params.usageId, req.user!.id, body.usageEvents ?? []);
    res.json({
      success: true,
      data: { ...saved, costBasis: COST_BASIS },
    });
  })
);

router.post(
  '/tools',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(80),
        arguments: z.record(z.unknown()).optional(),
      })
      .parse(req.body ?? {});
    const { user, tenant } = await actorFromRequest(req);
    if (!user.voiceAssistantEnabled) {
      throw new ApiError('VOICE_DISABLED', 'The assistant is not switched on for this user.', 403);
    }
    const data = await runVoiceTool(
      {
        userId: user.id,
        tenantId: tenant.id,
        userName: `${user.firstName} ${user.lastName}`.trim(),
        tenantName: tenant.name,
      },
      body.name,
      body.arguments ?? {}
    );
    res.json({ success: true, data });
  })
);

router.post(
  '/pending/:id/confirm',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user, tenant } = await actorFromRequest(req);
    if (!user.voiceAssistantEnabled) {
      throw new ApiError('VOICE_DISABLED', 'The assistant is not switched on for this user.', 403);
    }
    const data = await runVoiceTool(
      {
        userId: user.id,
        tenantId: tenant.id,
        userName: `${user.firstName} ${user.lastName}`.trim(),
        tenantName: tenant.name,
      },
      'confirm_pending_change',
      { pending_change_id: req.params.id }
    );
    res.json({ success: true, data });
  })
);

router.post(
  '/pending/:id/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user, tenant } = await actorFromRequest(req);
    const data = await runVoiceTool(
      {
        userId: user.id,
        tenantId: tenant.id,
        userName: `${user.firstName} ${user.lastName}`.trim(),
        tenantName: tenant.name,
      },
      'cancel_pending_change',
      { pending_change_id: req.params.id }
    );
    res.json({ success: true, data });
  })
);

router.get(
  '/pending',
  authenticate,
  asyncHandler(async (req, res) => {
    const rows = await prisma.voicePendingChange.findMany({
      where: {
        userId: req.user!.id,
        tenantId: req.tenantId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        tool: row.tool,
        proposal_id: row.proposalId,
        summary: row.summary,
        before: JSON.parse(row.beforeJson),
        after: JSON.parse(row.afterJson),
        status: row.status,
        expires_at: row.expiresAt.toISOString(),
      })),
    });
  })
);

router.get(
  '/usage',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const rows = await prisma.xaiUsage.findMany({
      where: { tenantId: req.tenantId, startedAt: { gte: since } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startedAt: 'desc' },
    });
    const grouped = groupUsage(
      rows.map((row) => ({
        userId: row.userId,
        userName: `${row.user.firstName} ${row.user.lastName}`.trim(),
        startedAt: row.startedAt,
        seconds: row.endedAt
          ? Math.max(row.seconds, row.billableAudioSeconds ?? 0)
          : Math.max(
              row.seconds,
              (Date.now() - row.startedAt.getTime()) / 1000,
              row.billableAudioSeconds ?? 0
            ),
        estimatedCostUsd: row.estimatedCostUsd ?? 0,
      }))
    );
    res.json({
      success: true,
      data: {
        costBasis: COST_BASIS,
        usdPerMinute: usdPerMinute(),
        ...grouped,
      },
    });
  })
);

export default router;
