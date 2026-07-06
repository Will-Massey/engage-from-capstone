/**
 * Revert proposals incorrectly bulk-marked as ACCEPTED.
 * Restores status from sent/view timestamps; clears acceptance fields.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/revert-bulk-accepted.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/revert-bulk-accepted.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function inferPriorStatus(proposal: {
  sentAt: Date | null;
  viewedAt: Date | null;
  lastViewedAt?: Date | null;
}): 'DRAFT' | 'SENT' | 'VIEWED' {
  if (proposal.viewedAt || proposal.lastViewedAt) return 'VIEWED';
  if (proposal.sentAt) return 'SENT';
  return 'DRAFT';
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');

  const accepted = await prisma.proposal.findMany({
    where: { status: 'ACCEPTED' },
    select: {
      id: true,
      reference: true,
      title: true,
      sentAt: true,
      viewedAt: true,
      acceptedAt: true,
      _count: { select: { signatures: true } },
    },
    orderBy: { reference: 'asc' },
  });

  console.log(`Found ${accepted.length} proposal(s) with status ACCEPTED`);

  if (accepted.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const withSignatures = accepted.filter((p) => p._count.signatures > 0);
  const withoutSignatures = accepted.filter((p) => p._count.signatures === 0);

  console.log(`  ${withoutSignatures.length} without signatures (will revert)`);
  console.log(`  ${withSignatures.length} with signatures (will also revert per bulk fix request)`);

  const plan = accepted.map((p) => ({
    id: p.id,
    reference: p.reference,
    title: p.title,
    signatures: p._count.signatures,
    nextStatus: inferPriorStatus(p),
    acceptedAt: p.acceptedAt?.toISOString() ?? null,
  }));

  console.log('\nPlanned changes:');
  for (const row of plan) {
    console.log(
      `  ${row.reference} -> ${row.nextStatus} (signatures: ${row.signatures}, was accepted: ${row.acceptedAt ?? 'n/a'})`
    );
  }

  if (dryRun) {
    console.log('\nDry run only — pass --apply to execute.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const row of plan) {
    await prisma.proposal.update({
      where: { id: row.id },
      data: {
        status: row.nextStatus,
        acceptedAt: null,
        acceptanceNotifiedAt: null,
        paymentStatus: 'NOT_STARTED',
        paymentMandateId: null,
        paymentProvider: null,
        paidAt: null,
        paymentFailureReason: null,
      },
    });
    updated++;
  }

  // Remove orphan signatures left from erroneous bulk acceptance (if any)
  const sigDelete = await prisma.proposalSignature.deleteMany({
    where: { proposalId: { in: plan.map((p) => p.id) } },
  });

  await prisma.activityLog.create({
    data: {
      tenantId: (await prisma.proposal.findFirst({
        where: { id: plan[0]?.id },
        select: { tenantId: true },
      }))!.tenantId,
      action: 'PROPOSAL_BULK_REVERT_ACCEPTED',
      entityType: 'PROPOSAL',
      entityId: plan[0]?.id ?? 'bulk',
      description: `Bulk reverted ${updated} proposal(s) from erroneous ACCEPTED status`,
      metadata: JSON.stringify({ count: updated, references: plan.map((p) => p.reference) }),
    },
  });

  console.log(`\nReverted ${updated} proposal(s). Deleted ${sigDelete.count} signature record(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
