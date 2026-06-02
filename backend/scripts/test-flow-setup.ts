/**
 * One-off fixture for local flow testing (idempotent).
 * Usage: DATABASE_URL=... npx tsx scripts/test-flow-setup.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: 'demo' },
  });
  if (!tenant) {
    throw new Error('No demo tenant — run prisma db seed first');
  }

  let client = await prisma.client.findFirst({
    where: { tenantId: tenant.id, contactEmail: 'flow-test@example.com' },
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        tenantId: tenant.id,
        name: 'Flow Test Ltd',
        companyType: 'LIMITED_COMPANY',
        contactEmail: 'flow-test@example.com',
        contactName: 'Flow Tester',
        isActive: true,
      },
    });
    console.log('Created client:', client.id);
  } else {
    console.log('Client exists:', client.id);
  }

  let service = await prisma.serviceTemplate.findFirst({
    where: { tenantId: tenant.id, isActive: true },
  });

  if (!service) {
    service = await prisma.serviceTemplate.create({
      data: {
        tenantId: tenant.id,
        category: 'COMPLIANCE',
        name: 'Flow Test Service',
        description: 'Minimal service for flow testing',
        basePrice: 500,
        baseHours: 2,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY',
        tags: 'test',
        isActive: true,
        complexityFactors: '[]',
        requirements: '[]',
        deliverables: '[]',
      },
    });
    console.log('Created service:', service.id);
  } else {
    console.log('Service exists:', service.id);
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: 'admin@demo.practice' },
  });
  console.log('Demo user:', user ? user.email : 'MISSING');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
