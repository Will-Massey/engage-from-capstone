/**
 * One-off script to update service template prices and frequencies
 * Run with: node backend/scripts/update-service-prices.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const updates = [
  {
    name: 'Limited Company Formation',
    basePrice: 150,
    priceAmount: 150,
    billingCycle: 'ONE_TIME',
  },
  {
    name: 'Anti-Money Laundering (AML) Check',
    basePrice: 75,
    priceAmount: 75,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
  },
  {
    name: 'Xero Setup & Integration',
    basePrice: 450,
    priceAmount: 450,
    billingCycle: 'ONE_TIME',
  },
];

async function main() {
  console.log('🔧 Updating service template prices and frequencies...');

  for (const update of updates) {
    const name = update.name;
    const data = { ...update };
    delete data.name;

    const existing = await prisma.serviceTemplate.findFirst({
      where: { name },
    });

    if (!existing) {
      console.log(`⚠️  Service not found: ${name}`);
      continue;
    }

    await prisma.serviceTemplate.update({
      where: { id: existing.id },
      data,
    });

    console.log(`✅ Updated ${name}:`, data);
  }

  console.log('🎉 Done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
