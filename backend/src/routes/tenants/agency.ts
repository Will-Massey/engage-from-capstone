import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import {
  createAgencyLinkInvite,
  linkAgencySubAccount,
  listAgencySubAccounts,
} from '../../services/agencyAccountService.js';

const router = Router();

/**
 * GET /api/tenants/agency/sub-accounts
 * List linked agency sub-accounts (Enterprise)
 */
router.get(
  '/agency/sub-accounts',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const accounts = await listAgencySubAccounts(req.tenantId!);
    res.json({ success: true, data: accounts });
  })
);

/**
 * POST /api/tenants/agency/link-invite
 * The caller's own practice issues a single-use code to hand to a managing
 * agency. This is the consent step that authorises being linked as a sub-account.
 */
router.post(
  '/agency/link-invite',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const invite = await createAgencyLinkInvite(req.tenantId!);
    res.status(201).json({ success: true, data: invite });
  })
);

/**
 * POST /api/tenants/agency/sub-accounts
 * Link an existing tenant as agency sub-account. Requires a valid invite code
 * issued by the child practice (see /agency/link-invite).
 */
router.post(
  '/agency/sub-accounts',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const { childTenantId, inviteCode } = z
      .object({ childTenantId: z.string().uuid(), inviteCode: z.string().min(1) })
      .parse(req.body);
    const account = await linkAgencySubAccount(req.tenantId!, childTenantId, inviteCode);
    res.status(201).json({ success: true, data: account });
  })
);

export default router;
