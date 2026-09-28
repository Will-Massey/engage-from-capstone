import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { lookupActiveMcpKey, parseScopes, touchMcpKey } from '../services/mcp/mcpKeys.js';
import { handleMcpBody } from '../services/mcp/mcpProtocol.js';
import type { McpToolContext } from '../services/mcp/mcpTools.js';

const router = Router();

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : null;
}

async function mcpContext(req: {
  headers: Record<string, unknown>;
}): Promise<McpToolContext | null> {
  const token = bearerToken(req.headers.authorization as string | undefined);
  if (!token) return null;
  const key = await lookupActiveMcpKey(token);
  if (!key) return null;
  void touchMcpKey(key.id);
  return {
    tenantId: key.tenantId,
    tenantName: key.tenant.name,
    keyId: key.id,
    actorUserId: key.createdByUserId,
    scopes: parseScopes(key.scopes),
  };
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.status(405).set('Allow', 'POST').json({
      error: 'MCP uses Streamable HTTP. POST JSON-RPC to this URL with Authorization: Bearer.',
      transport: 'streamable-http',
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const ctx = await mcpContext(req);
    if (!ctx) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Invalid or revoked Engage MCP token' },
      });
      return;
    }

    const { status, payload } = await handleMcpBody(req.body, ctx);
    if (status === 202) {
      res.status(202).end();
      return;
    }
    res.status(status).json(payload);
  })
);

export default router;
