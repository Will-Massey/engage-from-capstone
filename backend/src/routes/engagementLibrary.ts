/**
 * Engagement clause library versioning — global library snapshots + per-tenant template drift.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getCurrentLibraryVersion,
  getQuarterlySchedule,
  getTemplatesNeedingUpdate,
  listLibraryVersions,
  publishLibraryVersion,
  publishQuarterlyLibraryRelease,
  VERSION_LABEL_PATTERN,
} from '../services/engagementLibraryVersionService.js';

const router = Router();

const publishSchema = z.object({
  versionLabel: z
    .string()
    .min(1)
    .max(32)
    .regex(VERSION_LABEL_PATTERN, 'Version label must look like 2026.2 or 2026.Q3'),
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

/** GET /api/engagement-library/quarterly-schedule */
router.get(
  '/quarterly-schedule',
  authenticate,
  asyncHandler(async (_req, res) => {
    const schedule = await getQuarterlySchedule();
    res.json({ success: true, data: schedule });
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

/** POST /api/engagement-library/publish-quarterly — scheduled-style release (admin) */
router.post(
  '/publish-quarterly',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await publishQuarterlyLibraryRelease({
      publishedByUserId: req.user!.id,
    });

    if (result.skipped === true) {
      res.json({
        success: true,
        data: {
          skipped: true,
          reason: result.reason,
          version: result.version,
        },
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        skipped: false,
        versionLabel: result.versionLabel,
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

/** POST /api/engagement-library/simulate-quarterly — admin test of quarterly release */
router.post(
  '/simulate-quarterly',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await publishQuarterlyLibraryRelease({
      publishedByUserId: req.user!.id,
      simulated: true,
    });

    if (result.skipped === true) {
      res.json({
        success: true,
        data: {
          skipped: true,
          reason: result.reason,
          version: result.version,
        },
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        skipped: false,
        simulated: true,
        versionLabel: result.versionLabel,
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
