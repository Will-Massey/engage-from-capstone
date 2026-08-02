/**
 * Practice forms library + bulk assign (staff).
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  listFormTemplates,
  saveFormTemplate,
  listAssignments,
  assignFormBulk,
  remindOverdueForms,
} from '../services/practiceFormsService.js';
import { prisma } from '../config/database.js';

const router = Router();

router.get(
  '/templates',
  authenticate,
  asyncHandler(async (req, res) => {
    const templates = await listFormTemplates(req.tenantId!);
    res.json({ success: true, data: { templates } });
  })
);

router.post(
  '/templates',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      category: z.string().max(80).optional(),
      isActive: z.boolean().optional(),
      fields: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            type: z.enum(['text', 'textarea', 'boolean', 'select', 'date', 'number']),
            label: z.string().min(1).max(200),
            required: z.boolean().optional(),
            options: z.array(z.string()).optional(),
            placeholder: z.string().optional(),
          })
        )
        .min(1)
        .max(40),
    });
    const body = schema.parse(req.body);
    const template = await saveFormTemplate(req.tenantId!, body);
    res.status(201).json({ success: true, data: template });
  })
);

router.get(
  '/assignments',
  authenticate,
  asyncHandler(async (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    const status = req.query.status as string | undefined;
    const assignments = await listAssignments(req.tenantId!, { clientId, status });
    res.json({ success: true, data: { assignments } });
  })
);

router.post(
  '/assign',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      templateId: z.string().min(1),
      clientIds: z.array(z.string().uuid()).min(1).max(200),
      dueInDays: z.number().int().min(1).max(90).optional().nullable(),
      forceResend: z.boolean().optional(),
    });
    const body = schema.parse(req.body);
    try {
      const result = await assignFormBulk({
        tenantId: req.tenantId!,
        templateId: body.templateId,
        clientIds: body.clientIds,
        userId: req.user?.id,
        dueInDays: body.dueInDays,
        forceResend: body.forceResend,
      });
      res.json({
        success: true,
        data: result,
        message: `Assigned to ${result.assigned} client(s)${
          result.skipped ? ` · skipped ${result.skipped} already pending` : ''
        }`,
      });
    } catch (e: any) {
      throw new ApiError('FORM_ASSIGN_FAILED', e?.message || 'Assign failed', 400);
    }
  })
);

/** Convenience: assign one template to all active clients (or filtered by lifecycle). */
router.post(
  '/assign-all-active',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      templateId: z.string().min(1),
      limit: z.number().int().min(1).max(200).optional(),
    });
    const body = schema.parse(req.body);
    const clients = await prisma.client.findMany({
      where: { tenantId: req.tenantId!, isActive: true },
      select: { id: true },
      take: body.limit || 100,
      orderBy: { name: 'asc' },
    });
    const result = await assignFormBulk({
      tenantId: req.tenantId!,
      templateId: body.templateId,
      clientIds: clients.map((c) => c.id),
      userId: req.user?.id,
    });
    res.json({
      success: true,
      data: result,
      message: `Bulk assigned to ${result.assigned} of ${clients.length} active clients`,
    });
  })
);

/** POST /api/forms/remind-overdue — mark overdue pending forms (staff chase list) */
router.post(
  '/remind-overdue',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const result = await remindOverdueForms(req.tenantId!);
    res.json({
      success: true,
      data: result,
      message: `Reminded ${result.reminded} overdue form assignment(s)`,
    });
  })
);

/**
 * POST /api/forms/resend-pending — re-issue pending assignments for a template
 * (new rows with forceResend for clients who still have pending — or all with pending)
 */
router.post(
  '/resend-pending',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      templateId: z.string().min(1),
      dueInDays: z.number().int().min(1).max(90).optional().default(7),
    });
    const body = schema.parse(req.body);
    const pending = await listAssignments(req.tenantId!, { status: 'pending' });
    const clientIds = [
      ...new Set(pending.filter((a) => a.templateId === body.templateId).map((a) => a.clientId)),
    ];
    if (clientIds.length === 0) {
      res.json({
        success: true,
        data: { assigned: 0, skipped: 0, assignments: [] },
        message: 'No pending assignments for this template',
      });
      return;
    }
    const result = await assignFormBulk({
      tenantId: req.tenantId!,
      templateId: body.templateId,
      clientIds,
      userId: req.user?.id,
      dueInDays: body.dueInDays,
      forceResend: true,
    });
    res.json({
      success: true,
      data: result,
      message: `Re-sent form to ${result.assigned} client(s)`,
    });
  })
);

export default router;
