/**
 * Engagement clause library versioning — global library snapshots + per-tenant template drift.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getCurrentLibraryVersion,
  getTemplatesNeedingUpdate,
  listLibraryVersions,
  publishLibraryVersion,
} from '../services/engagementLibraryVersionService.js';

const router = Router();

const publishSchema = z.object({
  versionLabel: z
    .string()
    .min(1)
    .max(32)
    .regex(/^\d{4}\.\d+$/, 'Version label must look like 2026.1'),
  changelog: z.string().max(4000).optional(),
});

/** GET /api/engagement-library/versions */
router.get(
  '/versions',
  authenticate,
  asyncHandler(async (_req, res) => {
    const versions = await listLibraryVersions();
    res.json({ success: true, data: versions });
  })
);

/** GET /api/engagement-library/current */
router.get(
  '/current',
  authenticate,
  asyncHandler(async (_req, res) => {
    const current = await getCurrentLibraryVersion();
    res.json({
      success: true,
      data: {
        id: current.id,
        versionLabel: current.versionLabel,
        publishedAt: current.publishedAt,
        changelog: current.changelog,
        clauseCount: JSON.parse(current.clausesJson || '[]').length,
      },
    });
  })
);

/** GET /api/engagement-library/templates-needing-update — tenant-scoped */
router.get(
  '/templates-needing-update',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await getTemplatesNeedingUpdate(req.tenantId!);
    res.json({ success: true, data });
  })
);

/** POST /api/engagement-library/publish — platform admin only */
router.post(
  '/publish',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = publishSchema.parse(req.body);
    const result = await publishLibraryVersion({
      versionLabel: body.versionLabel,
      changelog: body.changelog,
      publishedByUserId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: {
        version: {
          id: result.version.id,
          versionLabel: result.version.versionLabel,
          publishedAt: result.version.publishedAt,
          changelog: result.version.changelog,
        },
        proposalTemplatesFlagged: result.proposalTemplatesFlagged,
        coverLetterTemplatesFlagged: result.coverLetterTemplatesFlagged,
        changedClauseIds: result.changedClauseIds,
      },
    });
  })
);

export default router;