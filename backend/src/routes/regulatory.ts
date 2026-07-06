/**
 * Regulatory rule engine routes (W3.5)
 * GET /api/regulatory/check/:clientId
 */

import { Router } from 'express';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { checkRegulatoryRules } from '../services/regulatoryRules.js';

const router = Router();

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

export default router;
