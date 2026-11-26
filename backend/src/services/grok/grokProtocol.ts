import { callGrokTool, listGrokToolsForProtocol, type GrokToolContext } from './grokTools.js';

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2024-11-05'];
const SERVER_INFO = { name: 'engage-grok-connector', version: '1.0.0' };

export type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined;
}

function ok(id: JsonRpcId | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function fail(id: JsonRpcId | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function pickProtocolVersion(requested: unknown): string {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return '2025-03-26';
}

function instructions(ctx: GrokToolContext): string {
  return (
    `You are connected to ${ctx.tenantName} on Engage as ${ctx.userName}. ` +
    'You may list clients, list the service catalogue and its prices, list proposals, read one proposal and its history, and create or adjust a draft, including its title, valid until date, and payment terms. ' +
    'You must not send a proposal, email a client, ask for a signature, or move a proposal off draft. ' +
    'Caroline sends proposals from Engage herself. ' +
    'If a proposal is not a draft, say so and stop. ' +
    'Money is in pounds. Use the catalogue price unless the user names a fee. Do not invent fees or tax figures.'
  );
}

export async function handleGrokRequest(
  req: JsonRpcRequest,
  ctx: GrokToolContext
): Promise<Record<string, unknown> | null> {
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    if (isNotification(req)) return null;
    return fail(req.id, -32600, 'Invalid Request');
  }

  const method = req.method;
  const params = (req.params && typeof req.params === 'object' ? req.params : {}) as Record<
    string,
    unknown
  >;

  if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
    return null;
  }
  if (method === 'ping') return ok(req.id, {});

  if (method === 'initialize') {
    return ok(req.id, {
      protocolVersion: pickProtocolVersion(params.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: instructions(ctx),
    });
  }

  if (method === 'tools/list') {
    return ok(req.id, { tools: listGrokToolsForProtocol() });
  }

  if (method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : '';
    const result = await callGrokTool(name, params.arguments, ctx);
    if (!result.ok) {
      return ok(req.id, {
        isError: true,
        content: [{ type: 'text', text: result.error }],
      });
    }
    return ok(req.id, {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      structuredContent: result.data,
    });
  }

  if (method === 'resources/list' || method === 'prompts/list') {
    return ok(req.id, method === 'resources/list' ? { resources: [] } : { prompts: [] });
  }

  return fail(req.id, -32601, `Method not found: ${method}`);
}

export async function handleGrokBody(
  body: unknown,
  ctx: GrokToolContext
): Promise<{ status: number; payload: unknown }> {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return { status: 400, payload: fail(null, -32600, 'Empty batch') };
    }
    const results: unknown[] = [];
    for (const item of body) {
      const res = await handleGrokRequest(item as JsonRpcRequest, ctx);
      if (res) results.push(res);
    }
    return { status: 200, payload: results };
  }
  if (!body || typeof body !== 'object') {
    return { status: 400, payload: fail(null, -32700, 'Parse error') };
  }
  const res = await handleGrokRequest(body as JsonRpcRequest, ctx);
  if (!res) return { status: 202, payload: null };
  return { status: 200, payload: res };
}
