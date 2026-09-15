jest.mock('../../../config/database.js', () => ({ prisma: {} }));

import { handleMcpBody } from '../mcpProtocol';
import type { McpToolContext } from '../mcpTools';
import { generateMcpToken, hashMcpToken, MCP_TOKEN_PREFIX } from '../mcpKeys';

const ctx: McpToolContext = {
  tenantId: 't1',
  tenantName: 'Fortis Bookkeeping',
  keyId: 'k1',
  actorUserId: 'u1',
  scopes: new Set(['read', 'write_notes']),
};

describe('MCP token hashing', () => {
  it('prefixes tokens so staff can recognise them', () => {
    const minted = generateMcpToken();
    expect(minted.token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    expect(minted.hash).toBe(hashMcpToken(minted.token));
    expect(minted.prefix).toHaveLength(MCP_TOKEN_PREFIX.length + 8);
  });
});

describe('MCP JSON-RPC', () => {
  it('initializes with tools capability and practice instructions', async () => {
    const { status, payload } = await handleMcpBody(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test' } },
      },
      ctx
    );
    expect(status).toBe(200);
    const result = (payload as any).result;
    expect(result.serverInfo.name).toBe('engage-mcp-server');
    expect(result.capabilities.tools).toBeDefined();
    expect(result.instructions).toContain('Fortis Bookkeeping');
  });

  it('lists Engage tools including the job-note write', async () => {
    const { payload } = await handleMcpBody({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
    const names = (payload as any).result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'engage_practice_summary',
        'engage_search_clients',
        'engage_get_client',
        'engage_list_jobs',
        'engage_get_job',
        'engage_list_proposals',
        'engage_get_proposal',
        'engage_add_job_note',
      ])
    );
  });

  it('returns 202 for initialized notifications', async () => {
    const { status, payload } = await handleMcpBody(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ctx
    );
    expect(status).toBe(202);
    expect(payload).toBeNull();
  });

  it('errors on unknown methods', async () => {
    const { payload } = await handleMcpBody({ jsonrpc: '2.0', id: 3, method: 'nope' }, ctx);
    expect((payload as any).error.code).toBe(-32601);
  });

  it('returns a tool error (not a protocol crash) for an unknown tool', async () => {
    const { status, payload } = await handleMcpBody(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'engage_delete_practice', arguments: {} },
      },
      ctx
    );
    expect(status).toBe(200);
    expect((payload as any).result.isError).toBe(true);
    expect((payload as any).result.content[0].text).toMatch(/Unknown tool/);
  });
});
