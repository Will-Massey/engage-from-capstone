import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logOpsAccess } from '../utils/opsAudit.js';
import {
  GrokTokenError,
  listGrokTokens,
  mintGrokToken,
  publicGrokMcpPath,
  revokeGrokTokens,
} from '../services/grok/grokKeys.js';

const router = Router();

function text(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sendTokenError(
  res: { status: (code: number) => { json: (body: unknown) => void } },
  err: unknown
) {
  if (err instanceof GrokTokenError) {
    res.status(err.status).json({ success: false, error: err.message });
    return;
  }
  throw err;
}

/**
 * POST /api/admin/grok-connector/mint
 * Header: X-Admin-Key. Body: { email } or { userId }.
 * The token is in this response only. It is not written to the log.
 */
router.post(
  '/mint',
  asyncHandler(async (req, res) => {
    const email = text(req.body, 'email');
    const userId = text(req.body, 'userId');
    logOpsAccess(req, 'admin.grok-connector.mint', {
      hasEmail: Boolean(email),
      hasUserId: Boolean(userId),
    });
    try {
      const minted = await mintGrokToken({ email, userId, name: text(req.body, 'name') });
      res.status(201).json({
        success: true,
        data: {
          token: minted.token,
          prefix: minted.prefix,
          user_id: minted.userId,
          practice: minted.tenantName,
          shown_once: true,
          previous_tokens_revoked: minted.previousRevoked,
          mcp_path: publicGrokMcpPath(),
          header: 'Authorization: Bearer <token>',
        },
      });
    } catch (err) {
      sendTokenError(res, err);
    }
  })
);

/** POST /api/admin/grok-connector/revoke  Body: { email } or { userId } or { prefix }. */
router.post(
  '/revoke',
  asyncHandler(async (req, res) => {
    const email = text(req.body, 'email');
    const userId = text(req.body, 'userId');
    const prefix = text(req.body, 'prefix');
    logOpsAccess(req, 'admin.grok-connector.revoke', {
      hasEmail: Boolean(email),
      hasUserId: Boolean(userId),
      hasPrefix: Boolean(prefix),
    });
    if (!email && !userId && !prefix) {
      res
        .status(400)
        .json({ success: false, error: 'Pass an email, a user id, or a token prefix.' });
      return;
    }
    try {
      const revoked = await revokeGrokTokens({ email, userId, prefix });
      res.json({ success: true, data: { revoked } });
    } catch (err) {
      sendTokenError(res, err);
    }
  })
);

/** GET /api/admin/grok-connector?email=  Prefixes and times only. Never the token. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    logOpsAccess(req, 'admin.grok-connector.list', {
      hasEmail: Boolean(email),
      hasUserId: Boolean(userId),
    });
    try {
      const data = await listGrokTokens({ email, userId });
      res.json({ success: true, data });
    } catch (err) {
      sendTokenError(res, err);
    }
  })
);

export default router;
