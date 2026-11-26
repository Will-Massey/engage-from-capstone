import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';
import { lookupActiveGrokToken, parseScopes, touchGrokToken } from '../services/grok/grokKeys.js';
import { handleGrokBody } from '../services/grok/grokProtocol.js';
import type { GrokToolContext } from '../services/grok/grokTools.js';

const router = Router();

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : null;
}

async function grokContext(req: {
  headers: Record<string, unknown>;
}): Promise<GrokToolContext | null> {
  const token = bearerToken(req.headers.authorization as string | undefined);
  if (!token) return null;
  const key = await lookupActiveGrokToken(token);
  if (!key) return null;
  void touchGrokToken(key.id).catch(() => {
    logger.warn('Failed to record connector last use', { tokenId: key.id });
  });
  return {
    tenantId: key.tenantId,
    tenantName: key.tenant.name,
    userId: key.user.id,
    userName: `${key.user.firstName} ${key.user.lastName}`.trim(),
    tokenId: key.id,
    scopes: parseScopes(key.scopes),
  };
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.status(405).set('Allow', 'POST').json({
      error: 'This connector uses Streamable HTTP. POST JSON-RPC with Authorization: Bearer.',
      transport: 'streamable-http',
      path: '/api/grok/mcp',
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const ctx = await grokContext(req);
    if (!ctx) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Invalid or revoked Engage connector token' },
      });
      return;
    }
    const { status, payload } = await handleGrokBody(req.body, ctx);
    if (status === 202) {
      res.status(202).end();
      return;
    }
    res.status(status).json(payload);
  })
);

export default router;
