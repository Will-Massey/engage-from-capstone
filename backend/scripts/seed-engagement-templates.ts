/**
 * Seed EngagementLibraryVersion from ICAEW/ACCA clause packages if empty.
 * Run: npx tsx scripts/seed-engagement-templates.ts
 */
import { ensureInitialLibraryVersion } from '../src/services/engagementLibraryVersionService.js';
import { ENGAGEMENT_CLAUSE_LIBRARY } from '../src/data/engagementClauseLibrary.js';
import { prisma } from '../src/config/database.js';

async function main() {
  await ensureInitialLibraryVersion();

  const count = await prisma.engagementLibraryVersion.count();
  const current = await prisma.engagementLibraryVersion.findFirst({
    where: { isCurrent: true },
  });

  console.log(
    `Engagement library: ${ENGAGEMENT_CLAUSE_LIBRARY.length} clauses, ${count} version(s), current=${current?.versionLabel ?? 'none'}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
