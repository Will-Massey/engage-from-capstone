jest.mock('../../../config/database.js', () => ({ prisma: {} }));

import { handleGrokBody } from '../grokProtocol';
import type { GrokToolContext } from '../grokTools';
import { generateGrokToken, GROK_TOKEN_PREFIX, hashGrokToken } from '../grokKeys';

const ctx: GrokToolContext = {
  tenantId: 't1',
  tenantName: 'Marks and Co',
  userId: 'u1',
  userName: 'Caroline Marks',
  tokenId: 'tok1',
  scopes: new Set(['read', 'draft_proposals']),
};

describe('Grok token hashing', () => {
  it('prefixes tokens and stores only a hash', () => {
    const minted = generateGrokToken();
    expect(minted.token.startsWith(GROK_TOKEN_PREFIX)).toBe(true);
    expect(minted.hash).toBe(hashGrokToken(minted.token));
    expect(minted.hash).not.toBe(minted.token);
    expect(minted.prefix).toHaveLength(GROK_TOKEN_PREFIX.length + 8);
    expect(minted.token.includes(minted.hash)).toBe(false);
  });
});

describe('Grok JSON-RPC', () => {
  it('initializes as the draft connector', async () => {
    const { status, payload } = await handleGrokBody(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {} },
      },
      ctx
    );
    expect(status).toBe(200);
    const result = (payload as any).result;
    expect(result.serverInfo.name).toBe('engage-grok-connector');
    expect(result.instructions).toContain('Caroline Marks');
    expect(result.instructions).toContain('draft');
    expect(result.instructions).not.toMatch(/—/);
  });

  it('returns 202 for the initialized notification', async () => {
    const { status, payload } = await handleGrokBody(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ctx
    );
    expect(status).toBe(202);
    expect(payload).toBeNull();
  });

  it('returns a tool error for an unknown tool', async () => {
    const { status, payload } = await handleGrokBody(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'engage_send_proposal', arguments: {} },
      },
      ctx
    );
    expect(status).toBe(200);
    expect((payload as any).result.isError).toBe(true);
    expect((payload as any).result.content[0].text).toMatch(/Unknown tool/);
  });
});
