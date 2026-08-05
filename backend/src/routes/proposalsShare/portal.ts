/**
 * Client portal routes — portal link management (authenticated) and
 * public portal access (portal-token access)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { authenticate } from '../../middleware/auth.js';
import { extractTenant } from '../../middleware/tenant.js';
import { penceToPounds } from '../../utils/proposalPricing.js';
import {
  createClientPortalLink,
  revokeClientPortalLink,
  getClientByPortalToken,
  getClientProposalsForPortal,
} from '../../services/proposalSharingService.js';
import {
  getStorageService,
  StorageObjectMissingError,
} from '../../services/storage/storageService.js';

const router = Router();

// ==================== CLIENT PORTAL ROUTES ====================

// Create client portal link (authenticated)
router.post(
  '/portal/:clientId',
  authenticate,
  extractTenant,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    const schema = z.object({
      expiryDays: z.number().min(1).max(365).optional(),
      frontendOrigin: z.string().url().optional(),
    });
    const { expiryDays, frontendOrigin } = schema.parse(req.body);

    // Verify client exists and belongs to tenant
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    const origin =
      frontendOrigin || (typeof req.headers.origin === 'string' ? req.headers.origin : undefined);

    const result = await createClientPortalLink(clientId, expiryDays || 90, origin);

    res.json({
      success: true,
      data: result,
    });
  })
);

// Revoke client portal link (authenticated)
router.delete(
  '/portal/:clientId',
  authenticate,
  extractTenant,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    await revokeClientPortalLink(clientId);

    res.json({
      success: true,
      data: { message: 'Portal link revoked' },
    });
  })
);

// Resolve a single proposal's view path (public — portal token scoped).
// Keeps share tokens out of the bulk portal payload; issued on demand per proposal.
router.get(
  '/portal/:token/proposals/:proposalId/view-link',
  asyncHandler(async (req, res) => {
    const { token, proposalId } = req.params;

    const client = await getClientByPortalToken(token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, clientId: client.id },
      select: { shareToken: true, shareTokenExpiry: true, publicAccessEnabled: true },
    });

    if (
      !proposal ||
      !proposal.shareToken ||
      !proposal.publicAccessEnabled ||
      !proposal.shareTokenExpiry ||
      proposal.shareTokenExpiry <= new Date()
    ) {
      throw new ApiError(
        'PROPOSAL_LINK_UNAVAILABLE',
        'Proposal link not available or expired',
        404
      );
    }

    res.json({
      success: true,
      data: { viewPath: `/proposals/view/${proposal.shareToken}` },
    });
  })
);

// Get client portal data (public — link possession = access)
router.get(
  '/portal/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const client = await getClientByPortalToken(token);

    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }

    const proposals = await getClientProposalsForPortal(client.id);

    const jobs = await prisma.job.findMany({
      where: { clientId: client.id, tenantId: client.tenantId, isActive: true },
      select: {
        id: true,
        reference: true,
        title: true,
        boardColumn: true,
        dueAt: true,
        deadlineKind: true,
        proposedFeePence: true,
        phases: {
          select: { id: true, name: true, isComplete: true, progressPct: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
    });

    const files = await prisma.portalFile.findMany({
      where: { clientId: client.id, tenantId: client.tenantId },
      select: {
        id: true,
        name: true,
        mimeType: true,
        sizeBytes: true,
        uploadedBy: true,
        createdAt: true,
        jobId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: {
        client: {
          id: client.id,
          name: client.name,
          contactName: client.contactName,
          contactEmail: client.contactEmail,
        },
        practice: {
          name: client.tenant.name,
          primaryColor: client.tenant.primaryColor,
          logo: client.tenant.logo,
        },
        proposals: proposals.map((p) => ({
          id: p.id,
          reference: p.reference,
          title: p.title,
          status: p.status,
          total: penceToPounds(p.totalPence),
          subtotal: penceToPounds(p.subtotalPence),
          vatAmount: penceToPounds(p.vatAmountPence),
          discountAmount: penceToPounds(p.discountAmountPence),
          validUntil: p.validUntil,
          sentAt: p.sentAt,
          viewedAt: p.viewedAt,
          acceptedAt: p.acceptedAt,
          declinedAt: p.declinedAt,
          createdAt: p.createdAt,
          services: p.services.map((s) => ({
            ...s,
            unitPrice: penceToPounds(s.unitPricePence),
            lineTotal: penceToPounds(s.lineTotalPence),
            vatAmount: penceToPounds(s.vatAmountPence),
            grossTotal: penceToPounds(s.grossTotalPence),
          })),
          // shareToken is intentionally NOT exposed here — resolve per-proposal
          // via GET /portal/:token/proposals/:proposalId/view-link
          canView: Boolean(
            p.publicAccessEnabled &&
            p.shareToken &&
            p.shareTokenExpiry &&
            p.shareTokenExpiry > new Date()
          ),
        })),
        jobs: jobs.map((j) => ({
          id: j.id,
          reference: j.reference,
          title: j.title,
          boardColumn: j.boardColumn,
          dueAt: j.dueAt,
          deadlineKind: j.deadlineKind,
          proposedFee: penceToPounds(j.proposedFeePence),
          phases: j.phases,
          progressPct: j.phases.length
            ? Math.round(j.phases.reduce((a, p) => a + (p.progressPct || 0), 0) / j.phases.length)
            : 0,
        })),
        files,
      },
    });
  })
);

// Client uploads a file into their portal (public — portal token)
router.post(
  '/portal/:token/files',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const client = await getClientByPortalToken(token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }

    const schema = z.object({
      fileName: z.string().min(1).max(200),
      mimeType: z.string().min(1).max(120),
      data: z.string().min(1).max(12_000_000),
      jobId: z.string().uuid().optional().nullable(),
    });
    const body = schema.parse(req.body);

    if (body.jobId) {
      const job = await prisma.job.findFirst({
        where: { id: body.jobId, clientId: client.id, tenantId: client.tenantId },
      });
      if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);
    }

    const raw = body.data.includes(',') ? body.data.split(',')[1]! : body.data;
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length === 0) throw new ApiError('EMPTY_FILE', 'File is empty', 400);
    if (buffer.length > 8 * 1024 * 1024) {
      throw new ApiError('FILE_TOO_LARGE', 'File exceeds 8MB limit', 400);
    }

    const stored = await getStorageService().put({
      tenantId: client.tenantId,
      originalName: body.fileName,
      buffer,
      mimeType: body.mimeType,
    });

    const file = await prisma.portalFile.create({
      data: {
        name: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.key,
        uploadedBy: 'client',
        tenantId: client.tenantId,
        clientId: client.id,
        jobId: body.jobId || null,
      },
    });

    if (body.jobId) {
      await prisma.jobActivity.create({
        data: {
          kind: 'NOTE',
          message: `Client uploaded “${body.fileName}” via portal`,
          jobId: body.jobId,
          metadata: JSON.stringify({ portalFileId: file.id }),
        },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
        jobId: file.jobId,
      },
    });
  })
);

// Client downloads a portal file (must belong to their client)
router.get(
  '/portal/:token/files/:fileId/download',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const file = await prisma.portalFile.findFirst({
      where: {
        id: req.params.fileId,
        clientId: client.id,
        tenantId: client.tenantId,
      },
    });
    if (!file) throw new ApiError('NOT_FOUND', 'File not found', 404);
    let buffer: Buffer;
    try {
      buffer = await getStorageService().get(file.storageKey, {
        expectedTenantId: client.tenantId,
      });
    } catch (e) {
      if (e instanceof StorageObjectMissingError) {
        throw new ApiError(
          'FILE_UNAVAILABLE',
          'This file is no longer available — please upload it again.',
          410
        );
      }
      throw e;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  })
);

/** Records-pack / KYC-lite questionnaire (stored on client.notes JSON envelope) */
const RECORDS_FORM_MARKER = '<!--ENGAGE_PORTAL_FORMS-->';

type PortalFormPayload = {
  recordsPack?: {
    submittedAt: string;
    bankStatementsReady: boolean;
    bookkeepingSoftware: string;
    vatScheme: string;
    payroll: boolean;
    notes: string;
    contactPhone: string;
  };
};

function readPortalForms(notes: string | null | undefined): PortalFormPayload {
  if (!notes || !notes.includes(RECORDS_FORM_MARKER)) return {};
  try {
    const json = notes.split(RECORDS_FORM_MARKER)[1] || '';
    return JSON.parse(json) as PortalFormPayload;
  } catch {
    return {};
  }
}

function writePortalForms(notes: string | null | undefined, forms: PortalFormPayload): string {
  const base = (notes || '').split(RECORDS_FORM_MARKER)[0].trimEnd();
  return `${base}\n${RECORDS_FORM_MARKER}${JSON.stringify(forms)}`;
}

router.get(
  '/portal/:token/forms',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const full = await prisma.client.findUnique({
      where: { id: client.id },
      select: { notes: true, amlStatus: true, contactPhone: true },
    });
    const forms = readPortalForms(full?.notes);
    res.json({
      success: true,
      data: {
        schema: {
          id: 'records-pack',
          title: 'Records pack questionnaire',
          description:
            'Help your accountant prepare your work — bank statements, software, VAT and payroll.',
          fields: [
            {
              id: 'bankStatementsReady',
              type: 'boolean',
              label: 'Bank statements ready (last 12 months)',
            },
            {
              id: 'bookkeepingSoftware',
              type: 'text',
              label: 'Bookkeeping software (Xero, QBO, none…)',
            },
            { id: 'vatScheme', type: 'text', label: 'VAT scheme (if registered)' },
            { id: 'payroll', type: 'boolean', label: 'We run payroll' },
            { id: 'contactPhone', type: 'text', label: 'Best phone number' },
            { id: 'notes', type: 'textarea', label: 'Anything else we should know?' },
          ],
        },
        submission: forms.recordsPack || null,
        amlStatus: full?.amlStatus || 'NOT_STARTED',
      },
    });
  })
);

const recordsFormSchema = z.object({
  bankStatementsReady: z.boolean(),
  bookkeepingSoftware: z.string().max(120).optional().default(''),
  vatScheme: z.string().max(120).optional().default(''),
  payroll: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().default(''),
  contactPhone: z.string().max(40).optional().default(''),
});

router.post(
  '/portal/:token/forms/records-pack',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const body = recordsFormSchema.parse(req.body);
    const full = await prisma.client.findUnique({
      where: { id: client.id },
      select: { notes: true, contactPhone: true },
    });
    const forms = readPortalForms(full?.notes);
    forms.recordsPack = {
      submittedAt: new Date().toISOString(),
      bankStatementsReady: body.bankStatementsReady,
      bookkeepingSoftware: body.bookkeepingSoftware || '',
      vatScheme: body.vatScheme || '',
      payroll: !!body.payroll,
      notes: body.notes || '',
      contactPhone: body.contactPhone || '',
    };
    const notes = writePortalForms(full?.notes, forms);
    await prisma.client.update({
      where: { id: client.id },
      data: {
        notes,
        ...(body.contactPhone ? { contactPhone: body.contactPhone } : {}),
      },
    });

    // Flag open jobs with activity so staff see the form
    const openJobs = await prisma.job.findMany({
      where: {
        clientId: client.id,
        tenantId: client.tenantId,
        isActive: true,
        boardColumn: { not: 'COMPLETE' },
      },
      select: { id: true },
      take: 10,
    });
    if (openJobs.length) {
      await prisma.jobActivity.createMany({
        data: openJobs.map((j) => ({
          kind: 'NOTE',
          message: 'Client submitted records pack questionnaire via portal',
          jobId: j.id,
          metadata: JSON.stringify({ form: 'records-pack', ...forms.recordsPack }),
        })),
      });
    }

    await prisma.activityLog.create({
      data: {
        action: 'PORTAL_FORM_SUBMIT',
        entityType: 'Client',
        entityId: client.id,
        description: `Portal records pack submitted by ${client.name}`,
        metadata: JSON.stringify(forms.recordsPack),
        tenantId: client.tenantId,
      },
    });

    res.json({ success: true, data: { submission: forms.recordsPack } });
  })
);

// ==================== PORTAL FORMS (assigned bulk forms) ====================

router.get(
  '/portal/:token/forms/assigned',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const { listPortalFormsForClient } = await import('../../services/practiceFormsService.js');
    const forms = await listPortalFormsForClient(client.tenantId, client.id);
    res.json({ success: true, data: { forms } });
  })
);

router.post(
  '/portal/:token/forms/:assignmentId/submit',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const body = z
      .object({
        answers: z.record(z.unknown()),
      })
      .parse(req.body);
    const { submitPortalForm } = await import('../../services/practiceFormsService.js');
    try {
      const assignment = await submitPortalForm({
        tenantId: client.tenantId,
        clientId: client.id,
        assignmentId: req.params.assignmentId,
        answers: body.answers,
      });
      res.json({ success: true, data: { assignment } });
    } catch (e: any) {
      throw new ApiError('FORM_SUBMIT_FAILED', e?.message || 'Submit failed', 400);
    }
  })
);

// ==================== PORTAL OS: tasks + messages (public via token) ====================

router.get(
  '/portal/:token/os',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const { listPortalTasks, listPortalMessages } =
      await import('../../services/portalOsService.js');
    const [tasks, messages] = await Promise.all([
      listPortalTasks(client.tenantId, client.id),
      listPortalMessages(client.tenantId, client.id),
    ]);
    res.json({
      success: true,
      data: {
        tasks,
        messages,
        practiceName: client.tenant?.name || 'Practice',
      },
    });
  })
);

router.post(
  '/portal/:token/os/tasks',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const body = z
      .object({
        title: z.string().min(1).max(500),
        dueAt: z.string().optional().nullable(),
      })
      .parse(req.body);
    const { createPortalTask } = await import('../../services/portalOsService.js');
    const task = await createPortalTask({
      tenantId: client.tenantId,
      clientId: client.id,
      title: body.title,
      dueAt: body.dueAt || null,
      from: 'client',
      authorName: client.contactName || client.name,
    });
    res.status(201).json({ success: true, data: task });
  })
);

router.patch(
  '/portal/:token/os/tasks/:taskId',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const body = z.object({ done: z.boolean() }).parse(req.body);
    const { setPortalTaskDone } = await import('../../services/portalOsService.js');
    const task = await setPortalTaskDone({
      tenantId: client.tenantId,
      clientId: client.id,
      taskId: req.params.taskId,
      done: body.done,
    });
    if (!task) throw new ApiError('NOT_FOUND', 'Task not found', 404);
    res.json({ success: true, data: task });
  })
);

router.post(
  '/portal/:token/os/messages',
  asyncHandler(async (req, res) => {
    const client = await getClientByPortalToken(req.params.token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }
    const body = z.object({ body: z.string().min(1).max(4000) }).parse(req.body);
    const { createPortalMessage } = await import('../../services/portalOsService.js');
    const message = await createPortalMessage({
      tenantId: client.tenantId,
      clientId: client.id,
      body: body.body,
      from: 'client',
      authorName: client.contactName || client.name,
    });
    res.status(201).json({ success: true, data: message });
  })
);

export default router;
