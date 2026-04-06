import { PrismaClient } from '@prisma/client';
// Extend PrismaClient for row-level security and multi-tenancy
const globalForPrisma = global;
// Configure Prisma Client with connection pooling for serverless/production
const prismaClientSingleton = () => {
    return new PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    });
};
export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = prisma;
// Handle graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});
// Tenant-aware database operations
export class TenantPrismaClient {
    constructor(tenantId) {
        this.tenantId = tenantId;
    }
    // Apply tenant filter to queries
    withTenant(args) {
        return {
            ...args,
            where: {
                ...args.where,
                tenantId: this.tenantId,
            },
        };
    }
    // Client operations
    async findClients(args = {}) {
        return prisma.client.findMany(this.withTenant(args));
    }
    async findClientById(id) {
        return prisma.client.findFirst({
            where: { id, tenantId: this.tenantId },
        });
    }
    async createClient(data) {
        return prisma.client.create({
            data: { ...data, tenantId: this.tenantId },
        });
    }
    // Proposal operations
    async findProposals(args = {}) {
        return prisma.proposal.findMany(this.withTenant(args));
    }
    async findProposalById(id) {
        return prisma.proposal.findFirst({
            where: { id, tenantId: this.tenantId },
            include: {
                client: true,
                services: true,
                createdBy: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        });
    }
    async createProposal(data) {
        return prisma.proposal.create({
            data: { ...data, tenantId: this.tenantId },
            include: {
                client: true,
                services: true,
            },
        });
    }
    // Service template operations
    async findServiceTemplates(args = {}) {
        return prisma.serviceTemplate.findMany(this.withTenant({
            ...args,
            where: {
                ...args.where,
                isActive: true,
            },
        }));
    }
    // User operations
    async findUsers(args = {}) {
        return prisma.user.findMany(this.withTenant({
            ...args,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
            },
        }));
    }
}
// Health check function
export async function checkDatabaseHealth() {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return { healthy: true };
    }
    catch (error) {
        return { healthy: false, error: error.message };
    }
}
export default prisma;
