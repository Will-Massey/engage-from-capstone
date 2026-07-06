import { Router } from 'express';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/proposal-templates
 * List sector proposal templates for the tenant.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const { entityType, includeInactive } = req.query;

    const templates = await prisma.proposalTemplate.findMany({
      where: {
        tenantId,
        ...(includeInactive !== 'true' ? { isActive: true } : {}),
        ...(entityType ? { targetEntityType: String(entityType) } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        title: true,
        targetEntityType: true,
        targetIndustry: true,
        coverLetter: true,
        terms: true,
        serviceConfig: true,
        defaultPricing: true,
        usageCount: true,
        lastUsedAt: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: templates.map((t) => ({
        ...t,
        serviceConfig: safeJson(t.serviceConfig, []),
        defaultPricing: safeJson(t.defaultPricing, {}),
      })),
    });
  })
);

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default router;
