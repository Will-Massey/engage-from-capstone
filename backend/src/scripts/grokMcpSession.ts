/**
 * Scripted Streamable HTTP session against a local Engage server.
 * Creates a throwaway practice, drafts a proposal, adjusts it, then checks
 * that a non-draft edit is refused and a revoked token is rejected.
 *
 * Refuses to run when NODE_ENV is production or DATABASE_URL points at Neon or Render.
 *
 *   DATABASE_URL="postgresql://engage:engage_dev_password@localhost:5432/engage_dev" \
 *     npx tsx src/scripts/grokMcpSession.ts
 */
import type { Server } from 'http';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'local-grok-session-secret-minimum-32-characters';
}
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  process.env.NODE_ENV = 'test';
}

let disconnectDb: (() => Promise<void>) | null = null;

function assertSafeDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the session script in production.');
  }
  const raw = process.env.DATABASE_URL || '';
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch {
    host = raw;
  }
  if (/neon\.tech|render\.com|amazonaws\.com/i.test(host)) {
    throw new Error(`Refusing to run the session script against ${host}.`);
  }
}

async function rpc(
  base: string,
  token: string | null,
  body: Record<string, unknown>
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { status: res.status, json };
}

function toolText(json: any): string {
  return json?.result?.content?.[0]?.text || '';
}

async function main(): Promise<void> {
  assertSafeDatabase();
  const [
    { default: express },
    { prisma },
    { hashGrokToken },
    { default: grokMcpRoutes },
    { grokMcpLimiter },
  ] = await Promise.all([
    import('express'),
    import('../config/database.js'),
    import('../services/grok/grokKeys.js'),
    import('../routes/grokMcp.js'),
    import('../app/rateLimiters.js'),
  ]);
  disconnectDb = () => prisma.$disconnect();
  const stamp = Date.now().toString(36);
  const tenant = await prisma.tenant.create({
    data: { name: `Grok session ${stamp}`, subdomain: `grok-${stamp}`, vatRegistered: true },
  });
  try {
    const user = await prisma.user.create({
      data: {
        email: `grok-session-${stamp}@example.test`,
        passwordHash: 'not-a-login',
        firstName: 'Session',
        lastName: 'User',
        role: 'PARTNER',
        tenantId: tenant.id,
      },
    });
    const client = await prisma.client.create({
      data: {
        name: 'Session Test Ltd',
        contactEmail: `client-${stamp}@example.test`,
        companyType: 'LIMITED_COMPANY',
        tenantId: tenant.id,
      },
    });
    const monthly = await prisma.serviceTemplate.create({
      data: {
        name: 'Monthly bookkeeping',
        description: 'Books for the month',
        category: 'BOOKKEEPING',
        priceAmount: 150,
        basePrice: 150,
        billingCycle: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        priceDisplayMode: 'PER_MONTH',
        tenantId: tenant.id,
      },
    });
    const hourly = await prisma.serviceTemplate.create({
      data: {
        name: 'Advisory hour',
        description: 'Charged by the hour',
        category: 'ADVISORY',
        priceAmount: 75,
        basePrice: 75,
        billingCycle: 'HOURLY',
        defaultFrequency: 'HOURLY',
        priceDisplayMode: 'PER_HOUR',
        tenantId: tenant.id,
      },
    });

    const { mintGrokToken, revokeGrokTokens } = await import('../services/grok/grokKeys.js');
    const minted = await mintGrokToken({ userId: user.id, name: 'Session bot' });
    const token = minted.token;

    const app = express();
    app.use(express.json());
    app.use('/api/grok/mcp', grokMcpLimiter, grokMcpRoutes);
    const server: Server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No listen address');
    const base = `http://127.0.0.1:${address.port}/api/grok/mcp`;

    try {
      const init = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'session' },
        },
      });
      if (init.status !== 200 || init.json?.result?.serverInfo?.name !== 'engage-grok-connector') {
        throw new Error(`initialize failed: ${JSON.stringify(init.json)}`);
      }

      const listed = await rpc(base, token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const names = (listed.json?.result?.tools || []).map((t: { name: string }) => t.name);
      for (const required of [
        'engage_list_clients',
        'engage_list_services',
        'engage_create_draft_proposal',
        'engage_update_draft_line',
        'engage_update_draft_notes',
      ]) {
        if (!names.includes(required)) throw new Error(`Missing tool ${required}`);
      }

      const clients = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'engage_list_clients', arguments: {} },
      });
      if (clients.json?.result?.isError) throw new Error(toolText(clients.json));
      const clientRow = clients.json.result.structuredContent.items.find(
        (row: { id: string }) => row.id === client.id
      );
      if (!clientRow) throw new Error('Test client was not listed');

      const created = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'engage_create_draft_proposal',
          arguments: {
            client_id: client.id,
            title: 'Session draft',
            notes: 'First note',
            lines: [{ service_id: monthly.id, quantity: 1 }],
          },
        },
      });
      if (created.json?.result?.isError) throw new Error(toolText(created.json));
      const draft = created.json.result.structuredContent;
      if (draft.status !== 'DRAFT') throw new Error(`Expected DRAFT, got ${draft.status}`);
      if (draft.services[0].display_price_gbp !== 150) {
        throw new Error(`Expected catalogue fee 150, got ${draft.services[0].display_price_gbp}`);
      }
      const lineId = draft.services[0].id;

      const added = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'engage_add_draft_line',
          arguments: {
            proposal_id: draft.id,
            service_id: hourly.id,
            quantity: 4,
            hourly_billing_mode: 'ONE_OFF',
          },
        },
      });
      if (added.json?.result?.isError) throw new Error(toolText(added.json));
      if (added.json.result.structuredContent.services.length !== 2) {
        throw new Error('Hourly line was not added');
      }

      const changed = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'engage_update_draft_line',
          arguments: {
            proposal_id: draft.id,
            line_id: lineId,
            display_price_gbp: 180,
            billing_frequency: 'QUARTERLY',
          },
        },
      });
      if (changed.json?.result?.isError) throw new Error(toolText(changed.json));

      const noted = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'engage_update_draft_notes',
          arguments: { proposal_id: draft.id, notes: 'Adjusted in the session' },
        },
      });
      if (noted.json?.result?.isError) throw new Error(toolText(noted.json));

      const hourlyLine = added.json.result.structuredContent.services.find(
        (s: { name: string }) => s.name === 'Advisory hour'
      );
      const removed = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'engage_remove_draft_line',
          arguments: { proposal_id: draft.id, line_id: hourlyLine.id },
        },
      });
      if (removed.json?.result?.isError) throw new Error(toolText(removed.json));

      const readBack = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'engage_get_proposal', arguments: { proposal_id: draft.id } },
      });
      if (readBack.json?.result?.isError) throw new Error(toolText(readBack.json));
      const full = readBack.json.result.structuredContent;
      const kept = full.services[0];
      if (full.notes !== 'Adjusted in the session')
        throw new Error(`Notes not saved: ${full.notes}`);
      if (kept.display_price_gbp !== 180)
        throw new Error(`Fee not saved: ${kept.display_price_gbp}`);
      if (kept.billing_frequency !== 'QUARTERLY') {
        throw new Error(`Frequency not saved: ${kept.billing_frequency}`);
      }
      if (full.services.length !== 1) throw new Error('Hourly line was not removed');
      if (kept.line_net_gbp !== 180 || kept.vat_gbp !== 36 || kept.gross_gbp !== 216) {
        throw new Error(
          `Fee maths wrong: net ${kept.line_net_gbp} vat ${kept.vat_gbp} gross ${kept.gross_gbp}`
        );
      }

      const audits = await prisma.grokConnectorAudit.findMany({ where: { proposalId: draft.id } });
      if (audits.length < 4) throw new Error(`Expected audit rows, found ${audits.length}`);
      if (audits.some((row) => row.userId !== user.id))
        throw new Error('Audit user does not match');

      await prisma.proposal.update({ where: { id: draft.id }, data: { status: 'SENT' } });
      const refused = await rpc(base, token, {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'engage_update_draft_notes',
          arguments: { proposal_id: draft.id, notes: 'Should not stick' },
        },
      });
      if (!refused.json?.result?.isError) throw new Error('Non-draft edit was allowed');
      if (!toolText(refused.json).includes('SENT')) {
        throw new Error(`Refusal did not name the status: ${toolText(refused.json)}`);
      }
      const afterRefuse = await prisma.proposal.findUnique({ where: { id: draft.id } });
      if (afterRefuse?.notes !== 'Adjusted in the session') {
        throw new Error('A refused edit changed the notes');
      }
      if (afterRefuse.status !== 'SENT') throw new Error('Status was changed by the connector');

      await revokeGrokTokens({ userId: user.id });
      const rejected = await rpc(base, token, { jsonrpc: '2.0', id: 11, method: 'tools/list' });
      if (rejected.status !== 401) throw new Error(`Revoked token status ${rejected.status}`);
      const stored = await prisma.grokConnectorToken.findFirst({ where: { userId: user.id } });
      if (!stored?.keyHash || stored.keyHash === token) {
        throw new Error('Token was stored in plaintext');
      }
      if (stored.keyHash !== hashGrokToken(token)) throw new Error('Stored hash does not match');

      console.log('PASS');
      console.log(
        `proposal ${draft.reference} created, adjusted, read back, non-draft refused, token revoked`
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  } finally {
    await prisma.proposal.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (disconnectDb) await disconnectDb();
  });
