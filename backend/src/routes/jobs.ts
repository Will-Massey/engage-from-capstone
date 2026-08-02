import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { spawnJobForProposal } from '../services/jobSpawnService.js';
import { getStorageService } from '../services/storage/storageService.js';
import {
  boardColumnLabel,
  getChasePack,
  listChasePacks,
  renderChaseTemplate,
} from '../services/chasePackService.js';
import { chatCompletion, isAiConfigured } from '../services/ai/aiClient.js';
import { createEmailService } from '../services/emailService.js';

const router = Router();

const BOARD_COLUMNS = [
  'REQUEST_RECORDS',
  'RECORDS_RECEIVED',
  'IN_PROGRESS',
  'HELP_NEEDED',
  'IN_REVIEW',
  'COMPLETE',
] as const;

const jobInclude = {
  client: { select: { id: true, name: true, contactName: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  proposal: { select: { id: true, reference: true, status: true } },
  phases: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      checklistItems: { orderBy: { sortOrder: 'asc' as const } },
      _count: { select: { tasks: true } },
    },
  },
  _count: { select: { tasks: true, timeEntries: true, portalFiles: true } },
};

// List / board
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const boardColumn = req.query.boardColumn as string | undefined;
    const assigneeId = req.query.assigneeId as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const proposalId = req.query.proposalId as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const where: any = { tenantId, isActive: true };
    if (boardColumn && BOARD_COLUMNS.includes(boardColumn as any)) {
      where.boardColumn = boardColumn;
    }
    if (assigneeId) where.assigneeId = assigneeId;
    if (clientId) where.clientId = clientId;
    if (proposalId) where.proposalId = proposalId;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
        { client: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const jobs = await prisma.job.findMany({
      where,
      include: jobInclude,
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
    });

    // Column totals for board header
    const byColumn: Record<string, { count: number; feePence: number }> = {};
    for (const col of BOARD_COLUMNS) {
      byColumn[col] = { count: 0, feePence: 0 };
    }
    for (const j of jobs) {
      const bucket =
        byColumn[j.boardColumn] || (byColumn[j.boardColumn] = { count: 0, feePence: 0 });
      bucket.count += 1;
      bucket.feePence += j.proposedFeePence;
    }

    res.json({
      success: true,
      data: {
        jobs,
        columns: BOARD_COLUMNS.map((id) => ({
          id,
          ...byColumn[id],
        })),
      },
    });
  })
);

/**
 * Practice money under management from jobs board (complements Stripe recurring R1).
 * Open jobs' proposed fees = delivery pipeline value; overdue / complete slices.
 */
router.get(
  '/meta/pipeline',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const now = new Date();
    const jobs = await prisma.job.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        boardColumn: true,
        dueAt: true,
        proposedFeePence: true,
        actualPence: true,
        proposalId: true,
        proposal: {
          select: {
            paymentStatus: true,
            stripeSubscriptionId: true,
            services: { select: { billingFrequency: true, grossTotalPence: true } },
          },
        },
      },
    });

    let openFee = 0;
    let openCount = 0;
    let overdueFee = 0;
    let overdueCount = 0;
    let completeFee = 0;
    let completeCount = 0;
    let actualLogged = 0;
    let withRecurringProposal = 0;
    let monthlyRecurringPence = 0;

    for (const j of jobs) {
      actualLogged += j.actualPence;
      if (j.boardColumn === 'COMPLETE') {
        completeFee += j.proposedFeePence;
        completeCount += 1;
      } else {
        openFee += j.proposedFeePence;
        openCount += 1;
        if (j.dueAt && j.dueAt < now) {
          overdueFee += j.proposedFeePence;
          overdueCount += 1;
        }
      }

      const services = j.proposal?.services || [];
      const hasRecurring = services.some((s) =>
        ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'].includes(s.billingFrequency)
      );
      if (hasRecurring || j.proposal?.stripeSubscriptionId) {
        withRecurringProposal += 1;
      }
      for (const s of services) {
        if (s.billingFrequency === 'MONTHLY') monthlyRecurringPence += s.grossTotalPence;
        else if (s.billingFrequency === 'QUARTERLY')
          monthlyRecurringPence += Math.round(s.grossTotalPence / 3);
        else if (s.billingFrequency === 'ANNUALLY')
          monthlyRecurringPence += Math.round(s.grossTotalPence / 12);
        else if (s.billingFrequency === 'WEEKLY')
          monthlyRecurringPence += Math.round((s.grossTotalPence * 52) / 12);
      }
    }

    res.json({
      success: true,
      data: {
        openFeePence: openFee,
        openCount,
        overdueFeePence: overdueFee,
        overdueCount,
        completeFeePence: completeFee,
        completeCount,
        actualLoggedPence: actualLogged,
        jobsWithRecurringProposal: withRecurringProposal,
        estimatedMonthlyRecurringPence: monthlyRecurringPence,
      },
    });
  })
);

/** Staff workload: open jobs + overdue + fee + logged minutes / utilisation */
router.get(
  '/meta/workload',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const now = new Date();
    /** Healthy open-job capacity per person before overload (practice default) */
    const CAPACITY_OPEN_JOBS = 8;
    /** Nominal weekly capacity hours for utilisation display */
    const CAPACITY_HOURS = 37.5;

    const jobs = await prisma.job.findMany({
      where: { tenantId, isActive: true, boardColumn: { not: 'COMPLETE' } },
      select: {
        id: true,
        title: true,
        reference: true,
        boardColumn: true,
        dueAt: true,
        deadlineKind: true,
        proposedFeePence: true,
        actualPence: true,
        assigneeId: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
    });

    const jobIds = jobs.map((j) => j.id);
    const minutesByJob = new Map<string, number>();
    if (jobIds.length > 0) {
      const groups = await prisma.timeEntry.groupBy({
        by: ['jobId'],
        where: { tenantId, jobId: { in: jobIds } },
        _sum: { minutes: true },
      });
      for (const g of groups) {
        minutesByJob.set(g.jobId, g._sum.minutes ?? 0);
      }
    }

    type Bucket = {
      assigneeId: string | null;
      name: string;
      openCount: number;
      overdueCount: number;
      feePence: number;
      actualPence: number;
      loggedMinutes: number;
      capacityOpenJobs: number;
      capacityHours: number;
      /** open jobs / capacity open jobs * 100 */
      loadPct: number;
      /** logged hours / capacity hours * 100 (capped display-side) */
      hoursPct: number;
      /** actual time value / fee * 100 */
      recoveryPct: number;
      jobs: typeof jobs;
    };

    const map = new Map<string, Bucket>();
    for (const j of jobs) {
      const key = j.assigneeId || '__unassigned__';
      if (!map.has(key)) {
        map.set(key, {
          assigneeId: j.assigneeId,
          name: j.assignee ? `${j.assignee.firstName} ${j.assignee.lastName}` : 'Unassigned',
          openCount: 0,
          overdueCount: 0,
          feePence: 0,
          actualPence: 0,
          loggedMinutes: 0,
          capacityOpenJobs: CAPACITY_OPEN_JOBS,
          capacityHours: CAPACITY_HOURS,
          loadPct: 0,
          hoursPct: 0,
          recoveryPct: 0,
          jobs: [],
        });
      }
      const b = map.get(key)!;
      b.openCount += 1;
      b.feePence += j.proposedFeePence;
      b.actualPence += j.actualPence;
      b.loggedMinutes += minutesByJob.get(j.id) ?? 0;
      if (j.dueAt && j.dueAt < now) b.overdueCount += 1;
      b.jobs.push(j);
    }

    for (const b of map.values()) {
      b.loadPct = Math.round((b.openCount / CAPACITY_OPEN_JOBS) * 100);
      const hours = b.loggedMinutes / 60;
      b.hoursPct = Math.round((hours / CAPACITY_HOURS) * 100);
      b.recoveryPct = b.feePence > 0 ? Math.round((b.actualPence / b.feePence) * 100) : 0;
    }

    const staff = Array.from(map.values()).sort(
      (a, b) => b.overdueCount - a.overdueCount || b.openCount - a.openCount
    );

    const totalLogged = staff.reduce((s, x) => s + x.loggedMinutes, 0);
    const totalFee = jobs.reduce((s, j) => s + j.proposedFeePence, 0);
    const totalActual = jobs.reduce((s, j) => s + j.actualPence, 0);

    res.json({
      success: true,
      data: {
        asOf: now.toISOString(),
        capacityOpenJobs: CAPACITY_OPEN_JOBS,
        capacityHours: CAPACITY_HOURS,
        totals: {
          open: jobs.length,
          overdue: jobs.filter((j) => j.dueAt && j.dueAt < now).length,
          feePence: totalFee,
          actualPence: totalActual,
          loggedMinutes: totalLogged,
          loadPct:
            staff.length > 0
              ? Math.round(staff.reduce((s, x) => s + x.loadPct, 0) / staff.length)
              : 0,
          recoveryPct: totalFee > 0 ? Math.round((totalActual / totalFee) * 100) : 0,
        },
        staff,
      },
    });
  })
);

const fileUploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  /** Base64 payload (optionally data-URL prefixed). Max ~8MB decoded. */
  data: z.string().min(1).max(12_000_000),
  jobId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid(),
});

function decodeBase64File(data: string): Buffer {
  const raw = data.includes(',') ? data.split(',')[1]! : data;
  return Buffer.from(raw, 'base64');
}

router.post(
  '/files',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = fileUploadSchema.parse(req.body);
    const tenantId = req.tenantId!;

    const client = await prisma.client.findFirst({
      where: { id: body.clientId, tenantId },
    });
    if (!client) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);

    if (body.jobId) {
      const job = await prisma.job.findFirst({
        where: { id: body.jobId, tenantId, clientId: body.clientId },
      });
      if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found for client', 404);
    }

    const buffer = decodeBase64File(body.data);
    if (buffer.length === 0) throw new ApiError('EMPTY_FILE', 'File is empty', 400);
    if (buffer.length > 8 * 1024 * 1024) {
      throw new ApiError('FILE_TOO_LARGE', 'File exceeds 8MB limit', 400);
    }

    const storage = getStorageService();
    const stored = await storage.put({
      tenantId,
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
        uploadedBy: req.user!.id,
        tenantId,
        clientId: body.clientId,
        jobId: body.jobId || null,
      },
    });

    if (body.jobId) {
      await prisma.jobActivity.create({
        data: {
          kind: 'NOTE',
          message: `Staff uploaded file “${body.fileName}”`,
          jobId: body.jobId,
          actorId: req.user!.id,
          metadata: JSON.stringify({ portalFileId: file.id }),
        },
      });
    }

    res.status(201).json({ success: true, data: file });
  })
);

router.get(
  '/files/:fileId/download',
  authenticate,
  asyncHandler(async (req, res) => {
    const file = await prisma.portalFile.findFirst({
      where: { id: req.params.fileId, tenantId: req.tenantId! },
    });
    if (!file) throw new ApiError('NOT_FOUND', 'File not found', 404);
    const buffer = await getStorageService().get(file.storageKey);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  })
);

const patchJobSchema = z.object({
  assigneeId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  deadlineKind: z.enum(['STATUTORY', 'INTERNAL', 'NONE']).optional(),
  notes: z.string().max(5000).optional(),
});

router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = patchJobSchema.parse(req.body);
    const existing = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

    if (body.assigneeId) {
      const user = await prisma.user.findFirst({
        where: { id: body.assigneeId, tenantId: req.tenantId! },
      });
      if (!user) throw new ApiError('USER_NOT_FOUND', 'Assignee not in tenant', 400);
    }

    const job = await prisma.job.update({
      where: { id: existing.id },
      data: {
        ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
        ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
        ...(body.deadlineKind !== undefined ? { deadlineKind: body.deadlineKind } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: jobInclude,
    });

    res.json({ success: true, data: job });
  })
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        ...jobInclude,
        tasks: { orderBy: { sortOrder: 'asc' } },
        timeEntries: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 40,
          include: { actor: { select: { id: true, firstName: true, lastName: true } } },
        },
        portalFiles: { orderBy: { createdAt: 'desc' }, take: 40 },
      },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);
    res.json({ success: true, data: job });
  })
);

const moveSchema = z.object({
  boardColumn: z.enum(BOARD_COLUMNS),
});

router.patch(
  '/:id/column',
  authenticate,
  asyncHandler(async (req, res) => {
    const { boardColumn } = moveSchema.parse(req.body);
    const existing = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

    const job = await prisma.job.update({
      where: { id: existing.id },
      data: {
        boardColumn,
        completedAt: boardColumn === 'COMPLETE' ? new Date() : null,
      },
      include: {
        ...jobInclude,
        proposal: {
          select: {
            id: true,
            reference: true,
            status: true,
            renewalDate: true,
            isRenewal: true,
          },
        },
      },
    });

    await prisma.jobActivity.create({
      data: {
        kind: 'COLUMN_CHANGED',
        message: `Moved to ${boardColumn.replace(/_/g, ' ').toLowerCase()}`,
        jobId: job.id,
        actorId: req.user?.id,
        metadata: JSON.stringify({ from: existing.boardColumn, to: boardColumn }),
      },
    });

    // W3.3 — job complete → renewal window nudge
    let renewalNudge: {
      proposalId: string;
      renewalDate: string | null;
      message: string;
    } | null = null;
    if (boardColumn === 'COMPLETE' && existing.boardColumn !== 'COMPLETE' && job.proposalId) {
      const prop = job.proposal;
      const renewDate = prop?.renewalDate ? new Date(prop.renewalDate) : null;
      const inWindow = !renewDate || renewDate.getTime() - Date.now() < 120 * 24 * 60 * 60 * 1000; // within ~4 months or unset
      if (inWindow) {
        const msg = renewDate
          ? `Job complete — renewal window open (renewal ${renewDate.toLocaleDateString('en-GB')}). Open bulk renewals or create next-year engagement.`
          : 'Job complete — consider scheduling renewal / next-year engagement for this client.';
        await prisma.jobActivity.create({
          data: {
            kind: 'NOTE',
            message: msg,
            jobId: job.id,
            actorId: req.user?.id,
            metadata: JSON.stringify({
              renewalNudge: true,
              proposalId: job.proposalId,
              renewalDate: renewDate?.toISOString() || null,
            }),
          },
        });
        renewalNudge = {
          proposalId: job.proposalId,
          renewalDate: renewDate?.toISOString() || null,
          message: msg,
        };
      }
    }

    res.json({ success: true, data: job, renewalNudge });
  })
);

const checklistSchema = z.object({
  isDone: z.boolean(),
});

async function recomputePhaseProgress(phaseId: string) {
  const siblings = await prisma.checklistItem.findMany({ where: { phaseId } });
  const done = siblings.filter((s) => s.isDone).length;
  const progressPct = siblings.length ? Math.round((done / siblings.length) * 100) : 0;
  const allDone = siblings.length > 0 && done === siblings.length;
  return prisma.jobPhase.update({
    where: { id: phaseId },
    data: {
      progressPct,
      isComplete: allDone,
      completedAt: allDone ? new Date() : null,
    },
  });
}

router.patch(
  '/checklist/:itemId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { isDone } = checklistSchema.parse(req.body);
    const item = await prisma.checklistItem.findFirst({
      where: { id: req.params.itemId },
      include: { phase: { include: { job: true, checklistItems: true } } },
    });
    if (!item || item.phase.job.tenantId !== req.tenantId) {
      throw new ApiError('NOT_FOUND', 'Checklist item not found', 404);
    }

    const updated = await prisma.checklistItem.update({
      where: { id: item.id },
      data: { isDone, completedAt: isDone ? new Date() : null },
    });

    await recomputePhaseProgress(item.phaseId);

    res.json({ success: true, data: updated });
  })
);

/** Mark every checklist item in a phase done (or reopen) */
router.patch(
  '/phases/:phaseId/complete',
  authenticate,
  asyncHandler(async (req, res) => {
    const { isComplete = true } = z
      .object({ isComplete: z.boolean().optional() })
      .parse(req.body ?? {});
    const phase = await prisma.jobPhase.findFirst({
      where: { id: req.params.phaseId },
      include: { job: true, checklistItems: true },
    });
    if (!phase || phase.job.tenantId !== req.tenantId) {
      throw new ApiError('NOT_FOUND', 'Phase not found', 404);
    }

    await prisma.checklistItem.updateMany({
      where: { phaseId: phase.id },
      data: { isDone: isComplete, completedAt: isComplete ? new Date() : null },
    });
    const updated = await recomputePhaseProgress(phase.id);

    await prisma.jobActivity.create({
      data: {
        kind: isComplete ? 'PHASE_COMPLETED' : 'PHASE_REOPENED',
        message: isComplete ? `Completed phase: ${phase.name}` : `Reopened phase: ${phase.name}`,
        jobId: phase.jobId,
        actorId: req.user?.id,
        metadata: JSON.stringify({ phaseId: phase.id }),
      },
    });

    res.json({ success: true, data: updated });
  })
);

const timeSchema = z.object({
  minutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  note: z.string().max(2000).optional(),
  phaseId: z.string().uuid().optional().nullable(),
  ratePence: z.number().int().min(0).optional(),
});

router.post(
  '/:id/time',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = timeSchema.parse(req.body);
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

    if (body.phaseId) {
      const phase = await prisma.jobPhase.findFirst({
        where: { id: body.phaseId, jobId: job.id },
      });
      if (!phase) {
        throw new ApiError('PHASE_NOT_FOUND', 'Phase does not belong to this job', 400);
      }
    }

    const ratePence = body.ratePence ?? 0;
    const amountPence = Math.round((body.minutes / 60) * ratePence);

    const entry = await prisma.timeEntry.create({
      data: {
        minutes: body.minutes,
        note: body.note,
        ratePence,
        amountPence,
        jobId: job.id,
        phaseId: body.phaseId || null,
        userId: req.user!.id,
        tenantId: req.tenantId!,
        endedAt: new Date(),
      },
    });

    const sum = await prisma.timeEntry.aggregate({
      where: { jobId: job.id },
      _sum: { amountPence: true },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { actualPence: sum._sum.amountPence ?? 0 },
    });

    await prisma.jobActivity.create({
      data: {
        kind: 'TIME_LOGGED',
        message: `Logged ${body.minutes} minutes`,
        jobId: job.id,
        actorId: req.user!.id,
        metadata: JSON.stringify({ timeEntryId: entry.id, minutes: body.minutes }),
      },
    });

    res.status(201).json({ success: true, data: entry });
  })
);

/** Bulk move jobs between board columns */
router.post(
  '/bulk/column',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        jobIds: z.array(z.string().uuid()).min(1).max(100),
        boardColumn: z.enum(BOARD_COLUMNS),
      })
      .parse(req.body);
    const tenantId = req.tenantId!;
    const jobs = await prisma.job.findMany({
      where: { tenantId, id: { in: body.jobIds }, isActive: true },
      select: { id: true, boardColumn: true },
    });
    if (!jobs.length) throw new ApiError('NOT_FOUND', 'No matching jobs', 404);

    await prisma.$transaction(
      jobs.map((j) =>
        prisma.job.update({
          where: { id: j.id },
          data: {
            boardColumn: body.boardColumn,
            completedAt: body.boardColumn === 'COMPLETE' ? new Date() : null,
          },
        })
      )
    );

    await prisma.jobActivity.createMany({
      data: jobs.map((j) => ({
        kind: 'COLUMN_CHANGED',
        message: `Bulk moved to ${body.boardColumn.replace(/_/g, ' ').toLowerCase()}`,
        jobId: j.id,
        actorId: req.user?.id,
        metadata: JSON.stringify({ from: j.boardColumn, to: body.boardColumn, bulk: true }),
      })),
    });

    res.json({
      success: true,
      data: { updated: jobs.length, boardColumn: body.boardColumn },
    });
  })
);

/**
 * POST /api/jobs/:id/tasks/from-notes — meeting notes / bullets → JobTask rows (W3.5)
 * Splits on newlines; strips bullets (-, *, •, 1.) and ignores empty lines.
 */
router.post(
  '/:id/tasks/from-notes',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        notes: z.string().min(1).max(20_000),
        phaseId: z.string().uuid().optional().nullable(),
        assigneeId: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

    if (body.phaseId) {
      const phase = await prisma.jobPhase.findFirst({
        where: { id: body.phaseId, jobId: job.id },
      });
      if (!phase) throw new ApiError('PHASE_NOT_FOUND', 'Phase not on this job', 400);
    }

    const lines = body.notes
      .split(/\r?\n/)
      .map((l) =>
        l
          .replace(/^\s*[-*•–—]\s+/, '')
          .replace(/^\s*\d+[.)]\s+/, '')
          .replace(/^\s*\[ ?[xX ] ?\]\s+/, '')
          .trim()
      )
      .filter((l) => l.length >= 2 && l.length <= 300)
      .slice(0, 40);

    if (!lines.length) {
      throw new ApiError('NO_TASKS', 'No task lines found in notes', 400);
    }

    const maxSort = await prisma.jobTask.aggregate({
      where: { jobId: job.id },
      _max: { sortOrder: true },
    });
    let sort = maxSort._max.sortOrder ?? 0;
    const created: Array<{
      id: string;
      title: string;
      isDone: boolean;
      sortOrder: number;
      jobId: string;
    }> = [];
    for (const title of lines) {
      sort += 1;
      const task = await prisma.jobTask.create({
        data: {
          title,
          phaseId: body.phaseId || null,
          assigneeId: body.assigneeId || null,
          sortOrder: sort,
          jobId: job.id,
        },
      });
      created.push(task);
    }

    await prisma.jobActivity.create({
      data: {
        kind: 'NOTE',
        message: `Created ${created.length} task(s) from meeting notes`,
        jobId: job.id,
        actorId: req.user?.id,
        metadata: JSON.stringify({ fromNotes: true, count: created.length }),
      },
    });

    res.status(201).json({
      success: true,
      data: { created: created.length, tasks: created },
      message: `Created ${created.length} task(s) from notes`,
    });
  })
);

/** Create a task on a job */
router.post(
  '/:id/tasks',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1).max(300),
        description: z.string().max(2000).optional(),
        phaseId: z.string().uuid().optional().nullable(),
        assigneeId: z.string().uuid().optional().nullable(),
        dueAt: z.string().datetime().optional().nullable(),
      })
      .parse(req.body);
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);
    if (body.phaseId) {
      const phase = await prisma.jobPhase.findFirst({
        where: { id: body.phaseId, jobId: job.id },
      });
      if (!phase) throw new ApiError('PHASE_NOT_FOUND', 'Phase not on this job', 400);
    }
    const maxSort = await prisma.jobTask.aggregate({
      where: { jobId: job.id },
      _max: { sortOrder: true },
    });
    const task = await prisma.jobTask.create({
      data: {
        title: body.title,
        description: body.description,
        phaseId: body.phaseId || null,
        assigneeId: body.assigneeId || null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        jobId: job.id,
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await prisma.jobActivity.create({
      data: {
        kind: 'TASK_CREATED',
        message: `Task added: ${body.title}`,
        jobId: job.id,
        actorId: req.user?.id,
        metadata: JSON.stringify({ taskId: task.id }),
      },
    });
    res.status(201).json({ success: true, data: task });
  })
);

router.patch(
  '/tasks/:taskId',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1).max(300).optional(),
        isDone: z.boolean().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        dueAt: z.string().datetime().nullable().optional(),
      })
      .parse(req.body);
    const task = await prisma.jobTask.findFirst({
      where: { id: req.params.taskId },
      include: { job: true },
    });
    if (!task || task.job.tenantId !== req.tenantId) {
      throw new ApiError('NOT_FOUND', 'Task not found', 404);
    }
    const updated = await prisma.jobTask.update({
      where: { id: task.id },
      data: {
        title: body.title,
        isDone: body.isDone,
        assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId,
        dueAt: body.dueAt === undefined ? undefined : body.dueAt ? new Date(body.dueAt) : null,
        completedAt: body.isDone === undefined ? undefined : body.isDone ? new Date() : null,
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  '/tasks/:taskId',
  authenticate,
  asyncHandler(async (req, res) => {
    const task = await prisma.jobTask.findFirst({
      where: { id: req.params.taskId },
      include: { job: true },
    });
    if (!task || task.job.tenantId !== req.tenantId) {
      throw new ApiError('NOT_FOUND', 'Task not found', 404);
    }
    await prisma.jobTask.delete({ where: { id: task.id } });
    res.json({ success: true, data: { id: task.id } });
  })
);

/** Manual spawn / re-run for accepted proposals (idempotent) */
router.post(
  '/spawn-from-proposal/:proposalId',
  authenticate,
  asyncHandler(async (req, res) => {
    const proposal = await prisma.proposal.findFirst({
      where: { id: req.params.proposalId, tenantId: req.tenantId! },
    });
    if (!proposal) throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    if (proposal.status !== 'ACCEPTED') {
      throw new ApiError('INVALID_STATUS', 'Proposal must be accepted', 400);
    }
    const result = await spawnJobForProposal(proposal.id, {
      actorId: req.user?.id,
      tenantId: req.tenantId!,
    });
    res.json({ success: true, data: result });
  })
);

/** UK chase pack catalogue */
router.get(
  '/meta/chase-packs',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: listChasePacks() });
  })
);

const chaseSchema = z.object({
  packId: z.string().min(1),
  /** If true and email is configured, send immediately; else return draft only */
  send: z.boolean().optional(),
  toEmail: z.string().email().optional(),
});

/** Build (and optionally send) a chase email for a job */
router.post(
  '/:id/chase',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = chaseSchema.parse(req.body);
    const pack = getChasePack(body.packId);
    if (!pack) throw new ApiError('PACK_NOT_FOUND', 'Unknown chase pack', 404);

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        client: true,
        phases: { orderBy: { sortOrder: 'asc' } },
        tenant: { select: { name: true } },
      },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

    const phase = job.phases.find((p) => !p.isComplete) || job.phases[job.phases.length - 1];
    const vars: Record<string, string | null> = {
      contact_name: job.client.contactName || 'Client',
      client_name: job.client.name,
      job_title: job.title,
      practice_name: job.tenant.name,
      due_date: job.dueAt
        ? job.dueAt.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : null,
      portal_link: null,
      phase_name: phase?.name || null,
      board_column: boardColumnLabel(job.boardColumn),
    };

    if (job.client.portalToken && job.client.portalEnabled) {
      const origin = process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || '';
      if (origin) {
        vars.portal_link = `${origin.replace(/\/$/, '')}/portal/${job.client.portalToken}`;
      }
    }

    const subject = renderChaseTemplate(pack.subject, vars);
    const bodyHtml = renderChaseTemplate(pack.bodyHtml, vars);
    const to = body.toEmail || job.client.contactEmail;

    let sent = false;
    let sendError: string | undefined;
    if (body.send) {
      try {
        const email = createEmailService();
        if (!email) {
          sendError = 'Email not configured';
        } else {
          const result = await email.sendEmail({
            to,
            subject,
            html: bodyHtml,
            text: bodyHtml
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
          });
          if (result.success) sent = true;
          else sendError = result.error || 'Email send failed';
        }
      } catch (e: any) {
        sendError = e?.message || 'Email send failed';
      }
    }

    await prisma.jobActivity.create({
      data: {
        kind: 'NOTE',
        message: sent
          ? `Chase sent (${pack.name}) to ${to}`
          : `Chase drafted (${pack.name})${sendError ? ` — not sent: ${sendError}` : ''}`,
        jobId: job.id,
        actorId: req.user?.id,
        metadata: JSON.stringify({ packId: pack.id, sent, to, sendError }),
      },
    });

    res.json({
      success: true,
      data: { packId: pack.id, subject, bodyHtml, to, sent, sendError },
    });
  })
);

/** Clara (or template fallback): prioritise / draft custom chase copy for a job */
router.post(
  '/:id/clara/draft-chase',
  authenticate,
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        client: true,
        phases: { orderBy: { sortOrder: 'asc' }, include: { checklistItems: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

    const openPhases = job.phases.filter((p) => !p.isComplete);
    const openChecks = job.phases.flatMap((p) =>
      p.checklistItems.filter((c) => !c.isDone).map((c) => `${p.name}: ${c.label}`)
    );

    const contextBlock = [
      `Practice: ${job.tenant.name}`,
      `Client: ${job.client.name}`,
      `Contact: ${job.client.contactName || 'n/a'} <${job.client.contactEmail}>`,
      `Job: ${job.title} (${job.reference})`,
      `Board column: ${job.boardColumn}`,
      `Due: ${job.dueAt?.toISOString().slice(0, 10) || 'none'} (${job.deadlineKind})`,
      `Open phases: ${openPhases.map((p) => p.name).join('; ') || 'none'}`,
      `Open checklist: ${openChecks.slice(0, 12).join('; ') || 'none'}`,
    ].join('\n');

    let subject = `Update on ${job.title} — ${job.client.name}`;
    let bodyHtml = '';
    let source: 'clara' | 'template' = 'template';

    if (isAiConfigured()) {
      try {
        const result = await chatCompletion(
          [
            {
              role: 'system',
              content:
                'You are Clara, a UK accountancy practice co-pilot. Draft a concise professional client email in UK English. Return JSON only: {"subject":"...","bodyHtml":"<p>...</p>"}. Be warm, clear, and specific about next steps. No legal advice.',
            },
            {
              role: 'user',
              content: `Draft a chase / progress email for this delivery job:\n${contextBlock}`,
            },
          ],
          { jsonMode: true, temperature: 0.4, maxTokens: 800 }
        );
        const parsed = JSON.parse(result.content) as { subject?: string; bodyHtml?: string };
        if (parsed.subject) subject = parsed.subject;
        if (parsed.bodyHtml) {
          bodyHtml = parsed.bodyHtml;
          source = 'clara';
        }
      } catch {
        // fall through to template
      }
    }

    if (!bodyHtml) {
      const pack =
        getChasePack(
          job.boardColumn === 'REQUEST_RECORDS' ? 'RECORDS_REQUEST' : 'DEADLINE_APPROACHING'
        ) || getChasePack('INFO_NUDGE')!;
      const vars = {
        contact_name: job.client.contactName || 'Client',
        client_name: job.client.name,
        job_title: job.title,
        practice_name: job.tenant.name,
        due_date: job.dueAt?.toLocaleDateString('en-GB') || null,
        phase_name: openPhases[0]?.name || null,
        board_column: boardColumnLabel(job.boardColumn),
      };
      subject = renderChaseTemplate(pack.subject, vars);
      bodyHtml = renderChaseTemplate(pack.bodyHtml, vars);
      source = 'template';
    }

    res.json({
      success: true,
      data: {
        subject,
        bodyHtml,
        source,
        suggestedPackId:
          job.boardColumn === 'REQUEST_RECORDS' ? 'RECORDS_REQUEST' : 'DEADLINE_APPROACHING',
        openChecklist: openChecks.slice(0, 12),
      },
    });
  })
);

const activityNoteSchema = z.object({
  message: z.string().min(1).max(4000),
});

/** Parse @First @FirstLast @email mentions against tenant users */
function resolveMentions(
  message: string,
  users: Array<{ id: string; firstName: string; lastName: string; email: string }>
): Array<{ id: string; firstName: string; lastName: string; email: string }> {
  const tokens = message.match(/@([\w.+-]+(?:@[\w.-]+\.\w+)?|[\w]+(?:\s+[\w]+)?)/g) || [];
  const found = new Map<string, (typeof users)[0]>();
  for (const raw of tokens) {
    const token = raw.slice(1).trim().toLowerCase();
    if (!token) continue;
    for (const u of users) {
      const full = `${u.firstName} ${u.lastName}`.toLowerCase();
      const first = u.firstName.toLowerCase();
      const email = u.email.toLowerCase();
      if (
        token === email ||
        token === first ||
        token === full ||
        token === full.replace(/\s+/g, '') ||
        email.startsWith(token)
      ) {
        found.set(u.id, u);
      }
    }
  }
  return Array.from(found.values());
}

/** POST /api/jobs/:id/activity — staff note with optional @colleague mentions */
router.post(
  '/:id/activity',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = activityNoteSchema.parse(req.body);
    const tenantId = req.tenantId!;
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, title: true, reference: true },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

    const users = await prisma.user.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const mentions = resolveMentions(body.message, users);

    const activity = await prisma.jobActivity.create({
      data: {
        kind: 'NOTE',
        message: body.message,
        jobId: job.id,
        actorId: req.user?.id,
        metadata: JSON.stringify({
          mentions: mentions.map((m) => ({
            id: m.id,
            name: `${m.firstName} ${m.lastName}`,
            email: m.email,
          })),
        }),
      },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });

    // In-app ActivityLog pings for each @mention (colleague feed / audit)
    if (mentions.length > 0) {
      const actorName = req.user
        ? `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() ||
          req.user.email
        : 'A colleague';
      await prisma.activityLog.createMany({
        data: mentions.map((m) => ({
          action: 'JOB_MENTION',
          entityType: 'Job',
          entityId: job.id,
          description: `${actorName} mentioned you on ${job.reference}: ${body.message.slice(0, 200)}`,
          metadata: JSON.stringify({
            jobId: job.id,
            activityId: activity.id,
            mentionedUserId: m.id,
          }),
          tenantId,
          userId: m.id,
        })),
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...activity,
        mentions: mentions.map((m) => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
        })),
      },
    });
  })
);

export default router;
