import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  generateLetterHtml,
  letterTitle,
  type PracticeLetterType,
} from '../services/practiceLetterService.js';

const router = Router();

const TypeEnum = z.enum(['DISENGAGEMENT', 'PROFESSIONAL_CLEARANCE', 'HMRC_64_8']);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    const where: any = { tenantId: req.tenantId! };
    if (clientId) where.clientId = clientId;
    const letters = await prisma.practiceLetter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 100,
    });
    res.json({ success: true, data: letters });
  })
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const letter = await prisma.practiceLetter.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        client: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!letter) throw new ApiError('NOT_FOUND', 'Letter not found', 404);
    res.json({ success: true, data: letter });
  })
);

const createSchema = z.object({
  type: TypeEnum,
  clientId: z.string().uuid(),
  jobId: z.string().uuid().optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  successorFirm: z.string().max(300).optional().nullable(),
  effectiveDate: z.string().max(40).optional().nullable(),
  servicesSummary: z.string().max(1000).optional().nullable(),
});

router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const tenantId = req.tenantId!;

    const client = await prisma.client.findFirst({
      where: { id: body.clientId, tenantId },
    });
    if (!client) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);

    if (body.jobId) {
      const job = await prisma.job.findFirst({
        where: { id: body.jobId, tenantId, clientId: body.clientId },
      });
      if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const type = body.type as PracticeLetterType;
    const title = letterTitle(type, client.name);
    const bodyHtml = generateLetterHtml(type, {
      practiceName: tenant?.name || 'Practice',
      clientName: client.name,
      contactName: client.contactName,
      companyNumber: client.companyNumber,
      utr: client.utr,
      effectiveDate: body.effectiveDate || new Date().toLocaleDateString('en-GB'),
      reason: body.reason,
      successorFirm: body.successorFirm,
      servicesSummary: body.servicesSummary,
    });

    const letter = await prisma.practiceLetter.create({
      data: {
        type,
        status: 'DRAFT',
        title,
        bodyHtml,
        metaJson: JSON.stringify({
          reason: body.reason,
          successorFirm: body.successorFirm,
          effectiveDate: body.effectiveDate,
        }),
        tenantId,
        clientId: client.id,
        jobId: body.jobId || null,
        createdById: req.user?.id,
      },
    });

    res.status(201).json({ success: true, data: letter });
  })
);

router.patch(
  '/:id/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const status = z.enum(['DRAFT', 'SENT', 'ARCHIVED']).parse(req.body?.status);
    const existing = await prisma.practiceLetter.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing) throw new ApiError('NOT_FOUND', 'Letter not found', 404);

    const letter = await prisma.practiceLetter.update({
      where: { id: existing.id },
      data: {
        status,
        sentAt: status === 'SENT' ? new Date() : existing.sentAt,
      },
    });
    res.json({ success: true, data: letter });
  })
);

const patchLetterSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  bodyHtml: z.string().min(1).max(200_000).optional(),
  /** Block designer v1 — composed into bodyHtml if provided */
  blocks: z
    .array(
      z.object({
        type: z.enum(['header', 'body', 'services', 'fees', 'clauses', 'signoff']),
        content: z.string().max(50_000),
      })
    )
    .max(20)
    .optional(),
});

function blocksToHtml(
  blocks: Array<{ type: string; content: string }>
): string {
  const parts = blocks.map((b) => {
    const c = b.content;
    switch (b.type) {
      case 'header':
        return `<div class="letter-block letter-header"><p><strong>${escapeLite(c)}</strong></p></div>`;
      case 'services':
        return `<div class="letter-block letter-services"><p><strong>Services</strong></p><p>${escapeLite(c).replace(/\n/g, '<br/>')}</p></div>`;
      case 'fees':
        return `<div class="letter-block letter-fees"><p><strong>Fees</strong></p><p>${escapeLite(c).replace(/\n/g, '<br/>')}</p></div>`;
      case 'clauses':
        return `<div class="letter-block letter-clauses"><p><strong>Clauses</strong></p><p>${escapeLite(c).replace(/\n/g, '<br/>')}</p></div>`;
      case 'signoff':
        return `<div class="letter-block letter-signoff"><p>${escapeLite(c).replace(/\n/g, '<br/>')}</p></div>`;
      default:
        return `<div class="letter-block letter-body"><p>${escapeLite(c).replace(/\n/g, '<br/>')}</p></div>`;
    }
  });
  return `<div class="practice-letter">${parts.join('\n')}</div>`;
}

function escapeLite(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** PATCH /api/practice-letters/:id — edit draft body / block designer */
router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = patchLetterSchema.parse(req.body);
    const existing = await prisma.practiceLetter.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing) throw new ApiError('NOT_FOUND', 'Letter not found', 404);
    if (existing.status !== 'DRAFT') {
      throw new ApiError('NOT_DRAFT', 'Only draft letters can be edited', 400);
    }

    let bodyHtml = body.bodyHtml;
    let metaJson = existing.metaJson;
    if (body.blocks?.length) {
      bodyHtml = blocksToHtml(body.blocks);
      try {
        const meta = JSON.parse(existing.metaJson || '{}');
        meta.blocks = body.blocks;
        metaJson = JSON.stringify(meta);
      } catch {
        metaJson = JSON.stringify({ blocks: body.blocks });
      }
    }

    const letter = await prisma.practiceLetter.update({
      where: { id: existing.id },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(bodyHtml ? { bodyHtml } : {}),
        ...(metaJson ? { metaJson } : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: letter });
  })
);

export default router;
