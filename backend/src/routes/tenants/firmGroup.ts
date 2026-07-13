import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import {
  getFirmGroupContext,
  createFirmGroup,
  updateFirmGroup,
  dissolveFirmGroup,
  addPracticeToFirmGroup,
  createFirmGroupJoinCode,
  removePracticeFromFirmGroup,
  leaveFirmGroup,
} from '../../services/firmGroupService.js';

const router = Router();

const createFirmGroupSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens')
    .optional(),
});

const updateFirmGroupSchema = z.object({
  name: z.string().min(2).max(120),
});

const addPracticeSchema = z.object({
  subdomain: z.string().min(2).max(30),
  // Single-use join code issued by the target practice (consent).
  inviteCode: z.string().min(1).max(128),
});

/**
 * GET /api/tenants/firm-group — multi-firm workspace context (W4.3)
 */
router.get(
  '/firm-group',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await getFirmGroupContext(req.tenantId!, req.user!.role);
    res.json({ success: true, data });
  })
);

/**
 * POST /api/tenants/firm-group — create group; current practice becomes owner
 */
router.post(
  '/firm-group',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const { name, slug } = createFirmGroupSchema.parse(req.body);
    const data = await createFirmGroup(req.tenantId!, req.user!.role, { name, slug });
    res.status(201).json({ success: true, data });
  })
);

/**
 * PUT /api/tenants/firm-group — rename group (owner practice admins only)
 */
router.put(
  '/firm-group',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const { name } = updateFirmGroupSchema.parse(req.body);
    const data = await updateFirmGroup(req.tenantId!, req.user!.role, { name });
    res.json({ success: true, data });
  })
);

/**
 * DELETE /api/tenants/firm-group — dissolve group (owner practice admins only)
 */
router.delete(
  '/firm-group',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const data = await dissolveFirmGroup(req.tenantId!, req.user!.role);
    res.json({ success: true, data });
  })
);

/**
 * POST /api/tenants/firm-group/join-code — the current practice issues a single-use
 * join code to hand to a firm-group owner (consent to be linked).
 */
router.post(
  '/firm-group/join-code',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const data = await createFirmGroupJoinCode(req.tenantId!, req.user!.role);
    res.status(201).json({ success: true, data });
  })
);

/**
 * POST /api/tenants/firm-group/practices — link another practice by subdomain.
 * Requires a valid single-use join code issued by that practice.
 */
router.post(
  '/firm-group/practices',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const { subdomain, inviteCode } = addPracticeSchema.parse(req.body);
    const data = await addPracticeToFirmGroup(req.tenantId!, req.user!.role, subdomain, inviteCode);
    res.json({ success: true, data });
  })
);

/**
 * DELETE /api/tenants/firm-group/practices/:practiceId — remove member practice
 */
router.delete(
  '/firm-group/practices/:practiceId',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const data = await removePracticeFromFirmGroup(
      req.tenantId!,
      req.user!.role,
      req.params.practiceId
    );
    res.json({ success: true, data });
  })
);

/**
 * POST /api/tenants/firm-group/leave — member practice leaves the group
 */
router.post(
  '/firm-group/leave',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const data = await leaveFirmGroup(req.tenantId!, req.user!.role);
    res.json({ success: true, data });
  })
);

export default router;
