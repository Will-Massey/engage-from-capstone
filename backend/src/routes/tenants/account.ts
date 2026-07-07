import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { gdprService } from '../../services/gdprService.js';

const router = Router();

/**
 * GET /api/tenants/export
 * Full tenant data export for portability (GDPR Article 20). Admin/partner only.
 */
router.get(
  '/export',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const data = await gdprService.exportTenantData(req.tenantId!, prisma);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="engage-export-${req.tenantId}-${stamp}.json"`
    );
    res.send(JSON.stringify(data, null, 2));
  })
);

/**
 * POST /api/tenants/close-account
 * Close the practice account: deactivate + anonymize personal data, retaining
 * signatures and financial records for the legal window. Destructive, so it
 * requires an admin/partner and a typed confirmation matching the practice name.
 */
router.post(
  '/close-account',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const { confirmName, reason } = z
      .object({ confirmName: z.string().min(1), reason: z.string().max(500).optional() })
      .parse(req.body);

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { name: true },
    });
    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Practice not found', 404);
    }

    if (confirmName.trim().toLowerCase() !== tenant.name.trim().toLowerCase()) {
      throw new ApiError(
        'CONFIRMATION_MISMATCH',
        'Type the exact practice name to confirm account closure.',
        400
      );
    }

    const result = await gdprService.closeTenantAccount(req.tenantId!, prisma, {
      actorUserId: req.user!.id,
      reason,
    });

    res.json({ success: true, data: result });
  })
);

export default router;
