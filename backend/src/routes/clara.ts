/**
 * Clara agentic drafting routes (R5.1)
 * POST /api/clara/run-drafting — run this tenant's drafting pass now (senior roles)
 * GET  /api/clara/prioritise-board — rank at-risk jobs + suggested chases (W3.4)
 * GET  /api/clara/morning-brief — “what should I do this morning?”
 * GET  /api/clara/client-summary/:clientId — graph summary for partner demos
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { runClaraDraftingForTenant } from '../services/claraAgenticService.js';
import { prioritiseJobsBoard } from '../services/claraBoardService.js';
import { buildMorningBrief } from '../services/claraMorningBriefService.js';
import { prisma } from '../config/database.js';
import { listAssignments } from '../services/practiceFormsService.js';
import { listMailboxMessages } from '../services/mailboxService.js';

const router = Router();

router.get(
  '/prioritise-board',
  authenticate,
  asyncHandler(async (req, res) => {
    const limit = Math.min(20, Math.max(3, Number(req.query.limit) || 8));
    const data = await prioritiseJobsBoard(req.tenantId!, limit);
    res.json({ success: true, data });
  })
);

router.get(
  '/morning-brief',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user as { id?: string; firstName?: string } | undefined;
    const data = await buildMorningBrief(req.tenantId!, user?.id, user?.firstName);
    res.json({ success: true, data });
  })
);

router.get(
  '/client-summary/:clientId',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const clientId = req.params.clientId;
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: {
        id: true,
        name: true,
        contactName: true,
        contactEmail: true,
        lifecycleStage: true,
      },
    });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const [jobs, proposals, forms, mail] = await Promise.all([
      prisma.job.findMany({
        where: { tenantId, clientId, isActive: true, boardColumn: { not: 'COMPLETE' } },
        select: {
          id: true,
          reference: true,
          title: true,
          boardColumn: true,
          dueAt: true,
        },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.proposal.findMany({
        where: { tenantId, clientId, status: { in: ['SENT', 'VIEWED', 'DRAFT'] } },
        select: { id: true, reference: true, title: true, status: true, totalPence: true },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),
      listAssignments(tenantId, { clientId }),
      listMailboxMessages(tenantId, { limit: 20 }).then((msgs) =>
        msgs.filter((m) => m.clientId === clientId).slice(0, 5)
      ),
    ]);

    const openForms = forms.filter((f) => f.status === 'pending');
    const lines = [
      `${client.name}${client.contactName ? ` (${client.contactName})` : ''}`,
      `Lifecycle: ${client.lifecycleStage}`,
      jobs.length
        ? `Open jobs: ${jobs.map((j) => `${j.reference} ${j.boardColumn}`).join('; ')}`
        : 'No open jobs',
      openForms.length
        ? `Pending forms: ${openForms.map((f) => f.templateName).join(', ')}`
        : 'No pending forms',
      proposals.length
        ? `Live proposals: ${proposals.map((p) => `${p.reference} ${p.status}`).join('; ')}`
        : 'No open proposals',
      mail.length ? `Recent mail threads: ${mail.length}` : 'No matched mailbox threads',
    ];

    res.json({
      success: true,
      data: {
        client,
        jobs,
        proposals,
        forms: openForms,
        mail,
        narrative: lines.join('\n'),
      },
    });
  })
);

router.post(
  '/run-drafting',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const result = await runClaraDraftingForTenant(req.tenantId!);
    res.json({
      success: true,
      data: result,
      message: result.enabled
        ? `Clara drafted ${result.signalDrafts + result.renewalDrafts} proposal(s) for approval`
        : 'Clara autopilot is switched off for this practice',
    });
  })
);

export default router;
