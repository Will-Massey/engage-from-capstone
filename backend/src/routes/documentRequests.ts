/**
 * Document requests — staff side. Create/send/resend/cancel requests for
 * client documents; items are satisfied by portal uploads (see
 * proposalsShare/portal.ts) or manual override here.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createDocumentRequest,
  resendDocumentRequest,
  listDocumentRequests,
  cancelDocumentRequest,
  overrideItemStatus,
} from '../services/documentRequestService.js';

const router = Router();
router.use(authenticate);

function requestOrigin(req: { headers: Record<string, unknown> }): string | undefined {
  const origin = req.headers['origin'];
  return typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin : undefined;
}

/** Tenant-wide list (Documents hub). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        clientId: z.string().uuid().optional(),
        status: z.enum(['OPEN', 'COMPLETE', 'CANCELLED']).optional(),
      })
      .parse(req.query);
    const requests = await listDocumentRequests({
      tenantId: req.tenantId!,
      clientId: query.clientId,
      status: query.status,
    });
    res.json({ success: true, data: { requests } });
  })
);

/** Recent client/staff uploads across the tenant (Documents hub). */
router.get(
  '/recent-uploads',
  asyncHandler(async (req, res) => {
    const files = await prisma.portalFile.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        name: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: true,
        clientId: true,
        client: { select: { name: true } },
      },
    });
    res.json({
      success: true,
      data: {
        uploads: files.map((f) => ({
          id: f.id,
          name: f.name,
          sizeBytes: f.sizeBytes,
          createdAt: f.createdAt,
          uploadedBy: f.uploadedBy,
          clientId: f.clientId,
          clientName: f.client.name,
        })),
      },
    });
  })
);

/** Create a request (optionally send the email immediately). */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        clientId: z.string().uuid(),
        jobId: z.string().uuid().optional().nullable(),
        title: z.string().min(1).max(200),
        message: z.string().max(2000).optional().nullable(),
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              required: z.boolean().optional(),
            })
          )
          .min(1)
          .max(30),
        send: z.boolean().optional(),
      })
      .parse(req.body);

    const result = await createDocumentRequest({
      tenantId: req.tenantId!,
      clientId: body.clientId,
      jobId: body.jobId,
      title: body.title,
      message: body.message,
      items: body.items,
      createdById: req.user?.id,
      send: body.send !== false,
      frontendOrigin: requestOrigin(req),
    });
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/:id/resend',
  asyncHandler(async (req, res) => {
    const request = await resendDocumentRequest({
      tenantId: req.tenantId!,
      requestId: req.params.id,
      actorId: req.user?.id,
      frontendOrigin: requestOrigin(req),
    });
    res.json({ success: true, data: { request } });
  })
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const request = await cancelDocumentRequest({
      tenantId: req.tenantId!,
      requestId: req.params.id,
      actorId: req.user?.id,
    });
    res.json({ success: true, data: { request } });
  })
);

router.patch(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.enum(['PENDING', 'RECEIVED']) }).parse(req.body);
    const request = await overrideItemStatus({
      tenantId: req.tenantId!,
      requestId: req.params.id,
      itemId: req.params.itemId,
      status: body.status,
      actorId: req.user?.id,
    });
    res.json({ success: true, data: { request } });
  })
);

export default router;
