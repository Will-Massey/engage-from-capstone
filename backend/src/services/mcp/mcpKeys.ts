import crypto from 'crypto';
import { prisma } from '../../config/database.js';

export const MCP_TOKEN_PREFIX = 'eng_mcp_';
export const DEFAULT_MCP_SCOPES = 'read,write_notes';
export const MCP_MANAGE_ROLES = ['ADMIN', 'PARTNER', 'MD'] as const;

export function publicMcpUrl(): string {
  const base = (
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    'https://capstonesoftware.co.uk/engage'
  ).replace(/\/$/, '');
  return `${base}/api/mcp`;
}

export function hashMcpToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateMcpToken(): { token: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(32).toString('hex');
  const token = `${MCP_TOKEN_PREFIX}${secret}`;
  return {
    token,
    prefix: `${MCP_TOKEN_PREFIX}${secret.slice(0, 8)}`,
    hash: hashMcpToken(token),
  };
}

export function parseScopes(scopes: string): Set<string> {
  return new Set(
    scopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function previewFromPrefix(prefix: string): string {
  return `${prefix}…`;
}

export async function lookupActiveMcpKey(token: string) {
  const trimmed = token.trim();
  if (!trimmed.startsWith(MCP_TOKEN_PREFIX) || trimmed.length < 20) return null;
  const key = await prisma.mcpApiKey.findUnique({
    where: { keyHash: hashMcpToken(trimmed) },
    include: { tenant: { select: { id: true, name: true, isActive: true } } },
  });
  if (!key || key.revokedAt || !key.tenant.isActive) return null;
  return key;
}

export async function touchMcpKey(id: string): Promise<void> {
  await prisma.mcpApiKey.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

export async function getActiveMcpKey(tenantId: string) {
  return prisma.mcpApiKey.findFirst({
    where: { tenantId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
}

export async function mintMcpKey(input: { tenantId: string; userId?: string; name?: string }) {
  const generated = generateMcpToken();
  await prisma.$transaction([
    prisma.mcpApiKey.updateMany({
      where: { tenantId: input.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.mcpApiKey.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.userId || null,
        name: (input.name || 'Practice AI').trim() || 'Practice AI',
        prefix: generated.prefix,
        keyHash: generated.hash,
        scopes: DEFAULT_MCP_SCOPES,
      },
    }),
  ]);
  return generated;
}

export async function revokeMcpKeys(tenantId: string): Promise<number> {
  const result = await prisma.mcpApiKey.updateMany({
    where: { tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
