/**
 * Third-party integration endpoints.
 * AccountFlow mesh: mock by default — production AccountFlow never contacted
 * unless ACCOUNTFLOW_MESH_ALLOW_LIVE=true (see accountFlowMeshService).
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  getMeshStatus,
  handoffToAccountFlow,
  handoffAllOpenJobs,
  listMockAccountFlowState,
  getMockClient,
  getMockWork,
  applyInboundFromAccountFlow,
  pingAccountFlowTandem,
} from '../services/accountFlowMeshService.js';
import {
  getTenantXeroSettings,
  xeroStatusFromSettings,
  isXeroOAuthConfigured,
} from '../services/tenantXeroSettings.js';
import {
  getTenantQuickBooksSettings,
  quickbooksStatusFromSettings,
  isQuickBooksOAuthConfigured,
} from '../services/tenantQuickbooksSettings.js';

const router = Router();

/**
 * POST /accountflow/inbound — AccountFlow → Engage status mirror (no JWT).
 * Auth: X-API-Key or X-Mesh-Secret matching ACCOUNTFLOW_API_KEY or ACCOUNTFLOW_MESH_INBOUND_SECRET.
 * Body: { type, engageJobId, boardColumn|status, message? }
 */
router.post(
  '/accountflow/inbound',
  asyncHandler(async (req, res) => {
    const secret =
      (req.headers['x-mesh-secret'] as string) ||
      (req.headers['x-api-key'] as string) ||
      '';
    const expected =
      process.env.ACCOUNTFLOW_MESH_INBOUND_SECRET?.trim() ||
      process.env.ACCOUNTFLOW_API_KEY?.trim() ||
      '';
    if (!expected || secret !== expected) {
      throw new ApiError('UNAUTHORIZED', 'Invalid mesh inbound secret', 401);
    }

    const body = z
      .object({
        type: z.string().min(1),
        engageJobId: z.string().optional().nullable(),
        jobId: z.string().optional().nullable(),
        boardColumn: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        message: z.string().max(500).optional().nullable(),
      })
      .parse(req.body || {});

    const result = await applyInboundFromAccountFlow({
      type: body.type,
      engageJobId: body.engageJobId || body.jobId,
      boardColumn: body.boardColumn,
      status: body.status,
      message: body.message,
    });

    res.json({ success: true, data: result });
  })
);

router.use(authenticate);

/** Mesh status — safe for UI banners (+ optional Tandem ping when HTTP configured) */
router.get(
  '/accountflow/status',
  asyncHandler(async (_req, res) => {
    const status = getMeshStatus();
    const ping = await pingAccountFlowTandem();
    res.json({
      success: true,
      data: {
        ...status,
        tandemPing: ping,
        isolation:
          status.mode === 'mock'
            ? 'Mesh mock sandbox — production AccountFlow not contacted.'
            : 'Capstone Tandem HTTP enabled — calls AccountFlow /api/v1/external/tandem/* only.',
        accountflowClone: 'C:\\Users\\willi\\accountflow-practice (feat/mesh-sandbox)',
        contract: {
          clientsUpsert: 'POST /api/v1/external/tandem/clients/upsert',
          workUpsert: 'POST /api/v1/external/tandem/work/upsert',
          events: 'POST /api/v1/external/tandem/events',
          inbound: 'POST /api/integrations/accountflow/inbound (Engage reverse)',
        },
      },
    });
  })
);

/**
 * POST handoff — create/link AF client (+ work if job) and return deep link.
 * Deep link points at Engage sandbox UI until live AF is authorised.
 */
router.post(
  '/accountflow/handoff',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        proposalId: z.string().uuid().optional().nullable(),
        jobId: z.string().uuid().optional().nullable(),
        clientId: z.string().uuid().optional().nullable(),
        mode: z.enum(['open', 'create_and_open']).optional(),
      })
      .parse(req.body || {});

    if (!body.proposalId && !body.jobId && !body.clientId) {
      throw new ApiError(
        'VALIDATION',
        'Provide proposalId, jobId, or clientId for AccountFlow handoff',
        400
      );
    }

    const result = await handoffToAccountFlow({
      tenantId: req.tenantId!,
      proposalId: body.proposalId,
      jobId: body.jobId,
      clientId: body.clientId,
      mode: body.mode || 'create_and_open',
    });

    res.json({ success: true, data: result });
  })
);

/** Legacy GET stub — now returns real status + optional query handoff */
router.get(
  '/accountflow/handoff',
  asyncHandler(async (req, res) => {
    const proposalId = (req.query.proposalId as string) || undefined;
    const jobId = (req.query.jobId as string) || undefined;
    const clientId = (req.query.clientId as string) || undefined;

    if (!proposalId && !jobId && !clientId) {
      const status = getMeshStatus();
      res.json({
        success: true,
        data: {
          available: status.available,
          status: status.mode,
          message: status.message,
          deepLink: null,
          isolation: 'mock-default; production AccountFlow untouched',
        },
      });
      return;
    }

    const result = await handoffToAccountFlow({
      tenantId: req.tenantId!,
      proposalId,
      jobId,
      clientId,
      mode: 'create_and_open',
    });
    res.json({ success: true, data: result });
  })
);

/** Sandbox mirror of mock AF state for this tenant */
router.get(
  '/accountflow/sandbox/state',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: listMockAccountFlowState(req.tenantId!),
    });
  })
);

router.get(
  '/accountflow/sandbox/clients/:id',
  asyncHandler(async (req, res) => {
    const c = getMockClient(req.params.id);
    if (!c || c.tenantId !== req.tenantId) {
      throw new ApiError('NOT_FOUND', 'Mock AF client not found', 404);
    }
    res.json({ success: true, data: c });
  })
);

router.get(
  '/accountflow/sandbox/work/:id',
  asyncHandler(async (req, res) => {
    const w = getMockWork(req.params.id);
    if (!w || w.tenantId !== req.tenantId) {
      throw new ApiError('NOT_FOUND', 'Mock AF work not found', 404);
    }
    res.json({ success: true, data: w });
  })
);

/**
 * POST /api/integrations/accountflow/handoff-open-jobs
 * Batch-link all open jobs into AF mesh sandbox (mock).
 */
router.post(
  '/accountflow/handoff-open-jobs',
  asyncHandler(async (req, res) => {
    const result = await handoffAllOpenJobs(req.tenantId!);
    res.json({
      success: true,
      data: result,
      message: `Mesh batch: ${result.linked} linked, ${result.skipped} skipped (${result.mode})`,
    });
  })
);

/**
 * GET /api/integrations/hub — Xero / QuickBooks / AccountFlow status one-shot
 * for the practice integrations desk (deeper than Settings alone).
 */
router.get(
  '/hub',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const mesh = getMeshStatus();
    const xeroSettings = await getTenantXeroSettings(tenantId);
    const xero = xeroStatusFromSettings(xeroSettings);
    const qbSettings = await getTenantQuickBooksSettings(tenantId);
    const quickbooks = quickbooksStatusFromSettings(qbSettings);
    const meshState = listMockAccountFlowState(tenantId);

    res.json({
      success: true,
      data: {
        accountFlow: {
          ...mesh,
          sandboxClients: meshState.clients.length,
          sandboxWork: meshState.work.length,
          isolation: 'mock-default; production AccountFlow never contacted without ALLOW_LIVE',
        },
        xero: {
          ...xero,
          oauthConfigured: isXeroOAuthConfigured(),
          docs: 'docs/XERO_QBO_GOLIVE.md',
          connectPath: '/api/xero/connect',
          settingsHint: 'Settings → Integrations → Xero',
        },
        quickbooks: {
          ...quickbooks,
          oauthConfigured: isQuickBooksOAuthConfigured(),
          docs: 'docs/XERO_QBO_GOLIVE.md',
          connectPath: '/api/quickbooks/connect',
          settingsHint: 'Settings → Integrations → QuickBooks',
        },
      },
    });
  })
);

export default router;
