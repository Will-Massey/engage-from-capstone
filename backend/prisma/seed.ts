import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ENGAGEMENT_CLAUSE_LIBRARY } from '../src/data/engagementClauseLibrary.js';

const prisma = new PrismaClient();

const INITIAL_LIBRARY_VERSION = '2026.1';
const INITIAL_LIBRARY_CHANGELOG =
  'Initial firm-approved engagement clause library (UK GAAP, MTD, AML, fees & liability).';

async function seedEngagementLibraryVersion() {
  const existing = await prisma.engagementLibraryVersion.findFirst({
    where: { versionLabel: INITIAL_LIBRARY_VERSION },
  });

  if (existing) {
    console.log('ℹ️ Engagement library version already seeded:', existing.versionLabel);
    return;
  }

  await prisma.engagementLibraryVersion.updateMany({
    where: { isCurrent: true },
    data: { isCurrent: false },
  });

  const version = await prisma.engagementLibraryVersion.create({
    data: {
      versionLabel: INITIAL_LIBRARY_VERSION,
      changelog: INITIAL_LIBRARY_CHANGELOG,
      clausesJson: JSON.stringify(ENGAGEMENT_CLAUSE_LIBRARY),
      isCurrent: true,
      publishedAt: new Date(),
    },
  });

  console.log('✅ Seeded engagement library version:', version.versionLabel);

  // Pin existing templates to the initial library version (no drift flags on first deploy)
  await prisma.proposalTemplate.updateMany({
    where: { engagementLibraryVersionId: null },
    data: { engagementLibraryVersionId: version.id, needsUpdate: false },
  });
  await prisma.coverLetterTemplate.updateMany({
    where: { engagementLibraryVersionId: null },
    data: { engagementLibraryVersionId: version.id, needsUpdate: false },
  });
}

async function main() {
  console.log('Starting seed...');

  // Create demo tenant
  let tenant = await prisma.tenant.findFirst({
    where: { subdomain: 'demo' },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Accounting Practice',
        subdomain: 'demo',
        primaryColor: '#0ea5e9',
      },
    });
    console.log('✅ Created tenant:', tenant.id);
  } else {
    console.log('ℹ️ Tenant already exists:', tenant.id);
  }

  // Create demo admin user
  const existingUser = await prisma.user.findFirst({
    where: { email: 'admin@demo.practice' },
  });

  if (!existingUser) {
    const user = await prisma.user.create({
      data: {
        email: 'admin@demo.practice',
        passwordHash: await bcrypt.hash('DemoPass123!', 12),
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        tenantId: tenant.id,
        isActive: true,
      },
    });
    console.log('✅ Created demo user:', user.email);
  } else {
    console.log('ℹ️ Demo user already exists');
  }

  await seedEngagementLibraryVersion();

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
