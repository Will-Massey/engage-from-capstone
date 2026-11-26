/**
 * Mint or revoke a Grok connector token.
 *
 * The plaintext token is printed once on stdout. It is not written to a file.
 *
 *   DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts mint --email "name@firm.co.uk"
 *   DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts revoke --email "name@firm.co.uk"
 *   DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts revoke --prefix eng_grok_abcd1234
 *   DATABASE_URL="postgresql://..." npx tsx src/scripts/grokConnectorToken.ts status --email "name@firm.co.uk"
 *
 * Run from the backend directory so Prisma can see the schema.
 */
import path from 'path';
import dotenv from 'dotenv';
import { prisma } from '../config/database.js';
import {
  listGrokTokens,
  mintGrokToken,
  publicGrokMcpPath,
  publicGrokMcpUrl,
  revokeGrokTokens,
} from '../services/grok/grokKeys.js';

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

function databaseLabel(): string {
  const raw = process.env.DATABASE_URL || '';
  try {
    const url = new URL(raw);
    const db = url.pathname.replace(/^\//, '');
    return `${url.hostname}:${url.port || '5432'}/${db}`;
  } catch {
    return 'unparsed DATABASE_URL';
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Pass the production URL in the environment.');
    process.exit(1);
  }

  const command = process.argv[2];
  const email = arg('--email');
  const userId = arg('--user-id');
  const prefix = arg('--prefix');
  console.log(`Database: ${databaseLabel()}`);

  if (command === 'mint') {
    const minted = await mintGrokToken({ email, userId, name: arg('--name') });
    console.log(`User: ${minted.userName} <${minted.userEmail}>`);
    console.log(`Practice: ${minted.tenantName}`);
    console.log(`Prefix: ${minted.prefix}`);
    console.log(`Earlier active tokens revoked: ${minted.previousRevoked}`);
    console.log(`MCP path: POST ${publicGrokMcpPath()}`);
    console.log(`Public URL: ${publicGrokMcpUrl()}`);
    console.log('Token (shown once):');
    console.log(minted.token);
    return;
  }

  if (command === 'revoke') {
    const revoked = await revokeGrokTokens({ email, userId, prefix });
    console.log(`Revoked ${revoked} active token(s).`);
    return;
  }

  if (command === 'status') {
    const data = await listGrokTokens({ email, userId });
    console.log(`User: ${data.name} <${data.email}>`);
    console.log(`Practice: ${data.practice}`);
    if (data.tokens.length === 0) {
      console.log('No tokens.');
      return;
    }
    for (const token of data.tokens) {
      const state = token.revokedAt ? `revoked ${token.revokedAt.toISOString()}` : 'active';
      const used = token.lastUsedAt ? token.lastUsedAt.toISOString() : 'never used';
      console.log(
        `${token.prefix}  created ${token.createdAt.toISOString()}  last used ${used}  ${state}`
      );
    }
    return;
  }

  console.error(
    'Usage: grokConnectorToken.ts mint|revoke|status --email <email> | --user-id <id> | --prefix <prefix>'
  );
  process.exit(1);
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Token command failed';
    console.error(message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
