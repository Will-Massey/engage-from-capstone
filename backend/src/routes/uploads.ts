import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { authenticateTenantMember } from '../middleware/tenant.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { r2Enabled, r2GetObject } from '../services/r2Storage.js';

const router = Router();

router.use(authenticateTenantMember);

/**
 * GET /api/uploads/signatures/:tenantId/:filename
 * Tenant-scoped signature file access (replaces public /uploads static serving).
 */
router.get(
  '/signatures/:tenantId/:filename',
  asyncHandler(async (req, res) => {
    const { tenantId, filename } = req.params;

    if (tenantId !== req.tenantId) {
      throw new ApiError('FORBIDDEN', 'Access denied', 403);
    }

    if (!/^[\w.-]+\.png$/i.test(filename)) {
      throw new ApiError('INVALID_PATH', 'Invalid file name', 400);
    }

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadsDir, 'signatures', tenantId, filename);

    const resolved = path.resolve(filePath);
    const allowedRoot = path.resolve(path.join(uploadsDir, 'signatures', tenantId));
    if (!resolved.startsWith(allowedRoot)) {
      throw new ApiError('FORBIDDEN', 'Invalid path', 403);
    }

    if (r2Enabled()) {
      const key = path.join('signatures', tenantId, filename).replace(/\\/g, '/');
      try {
        const buffer = await r2GetObject(key);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(buffer);
        return;
      } catch {
        throw new ApiError('NOT_FOUND', 'File not found', 404);
      }
    }

    try {
      await fs.access(resolved);
    } catch {
      throw new ApiError('NOT_FOUND', 'File not found', 404);
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(resolved);
  })
);

export default router;
