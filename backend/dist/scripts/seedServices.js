"use strict";
/**
 * Seed UK Accountancy Services into the database
 * Run: npx tsx src/scripts/seedServices.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const ukAccountancyServices_1 = require("../data/ukAccountancyServices");
const prisma = new client_1.PrismaClient();
async function seedServices() {
    console.log('🌱 Seeding UK Accountancy Services...\n');
    // Get the first tenant (demo tenant)
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        console.error('❌ No tenant found. Please run tenant creation first.');
        process.exit(1);
    }
    console.log(`📍 Using tenant: ${tenant.name} (${tenant.id})\n`);
    let created = 0;
    let skipped = 0;
    for (const service of ukAccountancyServices_1.allServices) {
        try {
            // Check if service already exists
            const existing = await prisma.serviceTemplate.findFirst({
                where: {
                    tenantId: tenant.id,
                    name: service.name,
                },
            });
            if (existing) {
                console.log(`⏭️  Skipped: ${service.name} (already exists)`);
                skipped++;
                continue;
            }
            // Create the service
            await prisma.serviceTemplate.create({
                data: {
                    tenantId: tenant.id,
                    category: service.category,
                    subcategory: service.subcategory,
                    name: service.name,
                    description: service.description,
                    longDescription: service.longDescription,
                    basePrice: service.basePrice,
                    baseHours: service.baseHours,
                    pricingModel: service.pricingModel,
                    billingCycle: service.billingCycle,
                    isVatApplicable: service.isVatApplicable,
                    vatRate: service.vatRate,
                    annualEquivalent: service.annualEquivalent,
                    frequencyOptions: service.frequencyOptions.join(','),
                    defaultFrequency: service.defaultFrequency,
                    applicableEntityTypes: service.applicableEntityTypes.join(','),
                    complexityFactors: JSON.stringify(service.complexityFactors),
                    requirements: JSON.stringify(service.requirements),
                    deliverables: JSON.stringify(service.deliverables),
                    regulatoryNotes: service.regulatoryNotes,
                    tags: service.tags.join(','),
                    isPopular: service.isPopular,
                    isActive: true,
                },
            });
            console.log(`✅ Created: ${service.name}`);
            created++;
        }
        catch (error) {
            console.error(`❌ Failed to create ${service.name}:`, error);
        }
    }
    console.log('\n📊 Summary:');
    console.log(`   ✅ Created: ${created} services`);
    console.log(`   ⏭️  Skipped: ${skipped} services`);
    console.log(`   📈 Total: ${created + skipped} services`);
    console.log('\n🎉 Done!');
}
seedServices()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seedServices.js.map