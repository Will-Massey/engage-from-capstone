import { Request, Response, NextFunction } from 'express';
import { assertTenantCanSendProposals } from '../services/subscriptionService.js';
import { asyncHandler } from './errorHandler.js';

/**
 * Blocks proposal send/email routes when the tenant's trial has expired
 * or subscription is otherwise inactive.
 */
export const requireActiveSubscription = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenantId) {
      return next();
    }
    await assertTenantCanSendProposals(req.tenantId);
    next();
  }
);
