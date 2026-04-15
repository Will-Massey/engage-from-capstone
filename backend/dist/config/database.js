"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantPrismaClient = exports.prisma = void 0;
exports.checkDatabaseHealth = checkDatabaseHealth;
const client_1 = require("@prisma/client");
// Extend PrismaClient for row-level security and multi-tenancy
const globalForPrisma = global;
// Configure Prisma Client with connection pooling for serverless/production
const prismaClientSingleton = () => {
    return new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    });
};
exports.prisma = globalForPrisma.prisma ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
// Handle graceful shutdown
process.on('beforeExit', async () => {
    await exports.prisma.$disconnect();
});
// Tenant-aware database operations
class TenantPrismaClient {
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
        return exports.prisma.client.findMany(this.withTenant(args));
    }
    async findClientById(id) {
        return exports.prisma.client.findFirst({
            where: { id, tenantId: this.tenantId },
        });
    }
    async createClient(data) {
        return exports.prisma.client.create({
            data: { ...data, tenantId: this.tenantId },
        });
    }
    // Proposal operations
    async findProposals(args = {}) {
        return exports.prisma.proposal.findMany(this.withTenant(args));
    }
    async findProposalById(id) {
        return exports.prisma.proposal.findFirst({
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
        return exports.prisma.proposal.create({
            data: { ...data, tenantId: this.tenantId },
            include: {
                client: true,
                services: true,
            },
        });
    }
    // Service template operations
    async findServiceTemplates(args = {}) {
        return exports.prisma.serviceTemplate.findMany(this.withTenant({
            ...args,
            where: {
                ...args.where,
                isActive: true,
            },
        }));
    }
    // User operations
    async findUsers(args = {}) {
        return exports.prisma.user.findMany(this.withTenant({
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
exports.TenantPrismaClient = TenantPrismaClient;
// Health check function
async function checkDatabaseHealth() {
    try {
        await exports.prisma.$queryRaw `SELECT 1`;
        return { healthy: true };
    }
    catch (error) {
        return { healthy: false, error: error.message };
    }
}
exports.default = exports.prisma;
//# sourceMappingURL=database.js.map