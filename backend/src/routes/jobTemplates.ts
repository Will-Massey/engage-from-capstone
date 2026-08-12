/**
 * Job template CRUD — editable phase/checklist blueprints for spawning Jobs
 * (directly, or via JobRecurrence). All service calls take req.tenantId!.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  listJobTemplates,
  getJobTemplate,
  createJobTemplate,
  updateJobTemplate,
  deleteJobTemplate,
  cloneJobTemplate,
  seedDefaultTemplates,
} from '../services/jobTemplateService.js';

const router = Router();

/** Full six-role set — every practice role can read job templates. */
const TEMPLATE_READ_ROLES = ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;
/** Mutating template actions exclude JUNIOR. */
const TEMPLATE_WRITE_ROLES = ['ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'] as const;

const checklistItemSchema = z.object({
  label: z.string().min(1).max(500),
  sortOrder: z.number().int().min(0),
});

const phaseSchema = z.object({
  name: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0),
  items: z.array(checklistItemSchema),
});

const templateInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  serviceCategory: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
  phases: z.array(phaseSchema),
});

const cloneSchema = z.object({
  name: z.string().min(1).max(200),
});

router.get(
  '/',
  authenticate,
  authorize(...TEMPLATE_READ_ROLES),
  asyncHandler(async (req, res) => {
    const templates = await listJobTemplates(req.tenantId!);
    res.json({ success: true, data: { templates } });
  })
);

router.get(
  '/:id',
  authenticate,
  authorize(...TEMPLATE_READ_ROLES),
  asyncHandler(async (req, res) => {
    const template = await getJobTemplate(req.tenantId!, req.params.id);
    if (!template) throw new ApiError('NOT_FOUND', 'Template not found', 404);
    res.json({ success: true, data: { template } });
  })
);

router.post(
  '/',
  authenticate,
  authorize(...TEMPLATE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = templateInputSchema.parse(req.body);
    const template = await createJobTemplate(req.tenantId!, body);
    res.status(201).json({ success: true, data: { template } });
  })
);

router.put(
  '/:id',
  authenticate,
  authorize(...TEMPLATE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = templateInputSchema.parse(req.body);
    const template = await updateJobTemplate(req.tenantId!, req.params.id, body);
    res.json({ success: true, data: { template } });
  })
);

router.delete(
  '/:id',
  authenticate,
  authorize(...TEMPLATE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    await deleteJobTemplate(req.tenantId!, req.params.id);
    res.json({ success: true });
  })
);

router.post(
  '/:id/clone',
  authenticate,
  authorize(...TEMPLATE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = cloneSchema.parse(req.body);
    const template = await cloneJobTemplate(req.tenantId!, req.params.id, body.name);
    res.status(201).json({ success: true, data: { template } });
  })
);

router.post(
  '/seed-defaults',
  authenticate,
  authorize(...TEMPLATE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const created = await seedDefaultTemplates(req.tenantId!);
    res.json({ success: true, data: { created } });
  })
);

export default router;
