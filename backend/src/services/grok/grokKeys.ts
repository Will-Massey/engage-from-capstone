import crypto from 'crypto';
import { prisma } from '../../config/database.js';

export const GROK_TOKEN_PREFIX = 'eng_grok_';
export const DEFAULT_GROK_SCOPES = 'read,draft_proposals';

export class GrokTokenError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function publicGrokMcpPath(): string {
  return '/api/grok/mcp';
}

/** Public URL a remote bot should call. The Cloudflare worker prefixes /engage. */
export function publicGrokMcpUrl(): string {
  const base = (
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    'https://capstonesoftware.co.uk/engage'
  ).replace(/\/$/, '');
  return `${base}/api/grok/mcp`;
}

export function hashGrokToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateGrokToken(): { token: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(32).toString('hex');
  const token = `${GROK_TOKEN_PREFIX}${secret}`;
  return {
    token,
    prefix: `${GROK_TOKEN_PREFIX}${secret.slice(0, 8)}`,
    hash: hashGrokToken(token),
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

type UserWithTenant = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  deletedAt: Date | null;
  tenantId: string;
  tenant: { id: string; name: string; isActive: boolean };
};

async function resolveUser(input: { email?: string; userId?: string }): Promise<UserWithTenant> {
  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { tenant: { select: { id: true, name: true, isActive: true } } },
    });
    if (!user) throw new GrokTokenError('No Engage user with that id.', 404);
    return user;
  }
  const email = input.email?.trim();
  if (!email) throw new GrokTokenError('Pass an email or a user id.');
  const users = await prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    include: { tenant: { select: { id: true, name: true, isActive: true } } },
  });
  if (users.length === 0) throw new GrokTokenError('No Engage user with that email.', 404);
  if (users.length > 1) {
    throw new GrokTokenError('More than one Engage user has that email. Pass a user id.');
  }
  return users[0];
}

function assertUserCanHoldToken(user: UserWithTenant): void {
  if (!user.isActive || user.deletedAt) {
    throw new GrokTokenError('That Engage user is not active.', 400);
  }
  if (!user.tenant.isActive) {
    throw new GrokTokenError('That practice is not active.', 400);
  }
}

export async function lookupActiveGrokToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed.startsWith(GROK_TOKEN_PREFIX) || trimmed.length < 20) return null;
  const row = await prisma.grokConnectorToken.findUnique({
    where: { keyHash: hashGrokToken(trimmed) },
    include: {
      tenant: { select: { id: true, name: true, isActive: true } },
      user: {
        select: {
          id: true,
          tenantId: true,
          firstName: true,
          lastName: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!row || row.revokedAt) return null;
  if (!row.user.isActive || row.user.deletedAt) return null;
  if (!row.tenant.isActive) return null;
  if (row.user.tenantId !== row.tenantId || row.user.tenantId !== row.tenant.id) return null;
  return row;
}

export async function touchGrokToken(id: string): Promise<void> {
  await prisma.grokConnectorToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

export type MintedGrokToken = {
  token: string;
  prefix: string;
  hash: string;
  userId: string;
  tenantId: string;
  userEmail: string;
  userName: string;
  tenantName: string;
  previousRevoked: number;
};

/**
 * Mint a token for one user. Any earlier active token for that user is revoked.
 * The plaintext token is returned to the caller and must not be logged or stored.
 */
export async function mintGrokToken(input: {
  email?: string;
  userId?: string;
  name?: string;
}): Promise<MintedGrokToken> {
  const user = await resolveUser(input);
  assertUserCanHoldToken(user);
  const generated = generateGrokToken();
  const name = (input.name || 'Grok Bot').trim() || 'Grok Bot';
  const previousRevoked = await prisma.$transaction(async (tx) => {
    const prior = await tx.grokConnectorToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.grokConnectorToken.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        name,
        prefix: generated.prefix,
        keyHash: generated.hash,
        scopes: DEFAULT_GROK_SCOPES,
      },
    });
    return prior.count;
  });
  return {
    ...generated,
    userId: user.id,
    tenantId: user.tenantId,
    userEmail: user.email,
    userName: `${user.firstName} ${user.lastName}`.trim(),
    tenantName: user.tenant.name,
    previousRevoked,
  };
}

export async function revokeGrokTokens(input: {
  email?: string;
  userId?: string;
  prefix?: string;
}): Promise<number> {
  const prefix = input.prefix?.trim();
  if (prefix) {
    const result = await prisma.grokConnectorToken.updateMany({
      where: { prefix, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
  const user = await resolveUser(input);
  const result = await prisma.grokConnectorToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function listGrokTokens(input: { email?: string; userId?: string }) {
  const user = await resolveUser(input);
  const rows = await prisma.grokConnectorToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return {
    userId: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    practice: user.tenant.name,
    tokens: rows,
  };
}
