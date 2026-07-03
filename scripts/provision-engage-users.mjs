#!/usr/bin/env node
/**
 * Reset Caroline + provision William on Engage production.
 * Requires DATABASE_URL (external Render Postgres URL).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const CAROLINE_EMAIL = 'caroline@fortisaccounts.com';
const CAROLINE_PASSWORD = 'Caroline2026!';
const WILLIAM_EMAIL = 'william@capstonesoftware.co.uk';
const WILLIAM_PASSWORD = 'Engage2026!';

const prisma = new PrismaClient();

async function main() {
  const demoTenant = await prisma.tenant.findFirst({ where: { subdomain: 'demo' } });
  if (!demoTenant) throw new Error('demo tenant missing');

  const carolineHash = await bcrypt.hash(CAROLINE_PASSWORD, 12);
  const caroline = await prisma.user.findFirst({
    where: { email: CAROLINE_EMAIL.toLowerCase() },
  });
  if (!caroline) throw new Error(`User not found: ${CAROLINE_EMAIL}`);

  await prisma.user.update({
    where: { id: caroline.id },
    data: { passwordHash: carolineHash, isActive: true },
  });

  const williamHash = await bcrypt.hash(WILLIAM_PASSWORD, 12);
  const william = await prisma.user.upsert({
    where: {
      email_tenantId: { email: WILLIAM_EMAIL.toLowerCase(), tenantId: demoTenant.id },
    },
    update: {
      passwordHash: williamHash,
      firstName: 'William',
      lastName: 'Massey',
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      email: WILLIAM_EMAIL.toLowerCase(),
      passwordHash: williamHash,
      firstName: 'William',
      lastName: 'Massey',
      role: 'ADMIN',
      tenantId: demoTenant.id,
      isActive: true,
    },
  });

  console.log('Provisioned:');
  console.log(`  Caroline: ${CAROLINE_EMAIL} / ${CAROLINE_PASSWORD} (Fortis, MD)`);
  console.log(`  William:  ${WILLIAM_EMAIL} / ${WILLIAM_PASSWORD} (Demo, ADMIN)`);
  console.log('IDs:', { caroline: caroline.id, william: william.id });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());