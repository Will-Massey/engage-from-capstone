/**
 * Regulatory rule engine routes (W3.5 + R5.2)
 * GET  /api/regulatory/check/:clientId       — point-in-time rule check
 * GET  /api/regulatory/signals               — persisted tenant signals
 * POST /api/regulatory/signals/:id/dismiss   — dismiss a signal (senior roles)
 * POST /api/regulatory/scan                  — on-demand tenant scan (senior roles)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { checkRegulatoryRules } from '../services/regulatoryRules.js';
import { scanTenantRegulatorySignals } from '../jobs/regulatoryScan.js';

const router = Router();

const SIGNAL_STATUSES = ['OPEN', 'DISMISSED', 'RESOLVED', 'ACTIONED'] as const;

router.get(
  '/check/:clientId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId, isActive: true },
      select: {
        id: true,
        companyType: true,
        turnover: true,
        mtditsaIncome: true,
        mtditsaStatus: true,
        vatRegistered: true,
      },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    const result = checkRegulatoryRules(client.id, {
      companyType: client.companyType,
      turnover: client.turnover,
      mtditsaIncome: client.mtditsaIncome,
      mtditsaStatus: client.mtditsaStatus,
      vatRegistered: client.vatRegistered,
    });

    res.json({
      success: true,
      data: result,
      message:
        result.summary.actionRequired > 0
          ? `${result.summary.actionRequired} regulatory action(s) required`
          : 'No mandatory regulatory actions identified',
    });
  })
);

/** GET /api/regulatory/signals — list tenant regulatory signals (with client name) */
router.get(
  '/signals',
  authenticate,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        status: z.enum(SIGNAL_STATUSES).optional(),
        clientId: z.string().uuid().optional(),
      })
      .parse(req.query);

    const signals = await prisma.regulatorySignal.findMany({
      where: {
        tenantId: req.tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
      },
      include: { client: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { firstRaisedAt: 'desc' }],
    });

    res.json({
      success: true,
      data: {
        signals: signals.map((s) => ({
          id: s.id,
          clientId: s.clientId,
          clientName: s.client.name,
          ruleId: s.ruleId,
          family: s.family,
          severity: s.severity,
          title: s.title,
          detail: s.detail,
          status: s.status,
          firstRaisedAt: s.firstRaisedAt,
          lastEvaluatedAt: s.lastEvaluatedAt,
          dismissedAt: s.dismissedAt,
          resolvedAt: s.resolvedAt,
        })),
      },
    });
  })
);

/** POST /api/regulatory/signals/:id/dismiss — dismiss an open signal */
router.post(
  '/signals/:id/dismiss',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});

    const signal = await prisma.regulatorySignal.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!signal) {
      throw new ApiError('SIGNAL_NOT_FOUND', 'Regulatory signal not found', 404);
    }

    const now = new Date();
    const updated = await prisma.regulatorySignal.update({
      where: { id: signal.id },
      data: {
        status: 'DISMISSED',
        dismissedAt: now,
        dismissedByUserId: req.user?.id ?? null,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user?.id,
        action: 'REGULATORY_SIGNAL_DISMISSED',
        entityType: 'CLIENT',
        entityId: signal.clientId,
        description: `Dismissed regulatory signal: ${signal.title}`,
        metadata: JSON.stringify({
          signalId: signal.id,
          ruleId: signal.ruleId,
          family: signal.family,
          reason: reason || null,
        }),
      },
    });

    res.json({
      success: true,
      data: { id: updated.id, status: updated.status, dismissedAt: updated.dismissedAt },
      message: 'Signal dismissed',
    });
  })
);

/** POST /api/regulatory/scan — run the regulatory scan for this tenant now */
router.post(
  '/scan',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const result = await scanTenantRegulatorySignals(req.tenantId!);
    res.json({
      success: true,
      data: result,
      message: `Scanned ${result.clientsEvaluated} client(s): ${result.raised} raised, ${result.resolved} resolved`,
    });
  })
);

export default router;
