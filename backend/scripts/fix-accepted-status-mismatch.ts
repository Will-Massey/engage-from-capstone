/**
 * Repair proposals where acceptance fields exist but status was downgraded
 * (e.g. resend email forced SENT → client view forced VIEWED).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/fix-accepted-status-mismatch.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/fix-accepted-status-mismatch.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');

  const mismatched = await prisma.proposal.findMany({
    where: {
      acceptedAt: { not: null },
      status: { not: 'ACCEPTED' },
    },
    select: {
      id: true,
      reference: true,
      status: true,
      acceptedAt: true,
      acceptedBy: true,
      _count: { select: { signatures: true } },
    },
    orderBy: { reference: 'asc' },
  });

  console.log(`Found ${mismatched.length} proposal(s) with acceptedAt but status != ACCEPTED`);

  for (const row of mismatched) {
    console.log(
      `  ${row.reference} status=${row.status} acceptedAt=${row.acceptedAt?.toISOString()} signatures=${row._count.signatures}`
    );
  }

  if (mismatched.length === 0) {
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log('\nDry run only — pass --apply to set status ACCEPTED.');
    await prisma.$disconnect();
    return;
  }

  for (const row of mismatched) {
    await prisma.proposal.update({
      where: { id: row.id },
      data: { status: 'ACCEPTED' },
    });
  }

  const tenantId = (await prisma.proposal.findFirst({
    where: { id: mismatched[0]!.id },
    select: { tenantId: true },
  }))!.tenantId;

  await prisma.activityLog.create({
    data: {
      tenantId,
      action: 'PROPOSAL_STATUS_RECONCILED',
      entityType: 'PROPOSAL',
      entityId: mismatched[0]!.id,
      description: `Reconciled ${mismatched.length} proposal(s) to ACCEPTED (acceptedAt present, status was stale)`,
      metadata: JSON.stringify({
        references: mismatched.map((p) => p.reference),
      }),
    },
  });

  console.log(`\nUpdated ${mismatched.length} proposal(s) to status ACCEPTED.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
