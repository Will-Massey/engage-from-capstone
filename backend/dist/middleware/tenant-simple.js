import { prisma } from '../config/database.js';
// Simple tenant extraction - always use 'demo' for Render
export const extractTenant = async (req, res, next) => {
    try {
        // For Render deployment, always use demo tenant
        // Try demo-practice first (older seeds), then demo (newer seeds)
        let tenant = await prisma.tenant.findFirst({
            where: {
                subdomain: 'demo-practice',
            },
        });
        if (!tenant) {
            tenant = await prisma.tenant.findFirst({
                where: {
                    subdomain: 'demo',
                },
            });
        }
        if (tenant) {
            req.tenantId = tenant.id;
            req.tenant = tenant;
        }
        next();
    }
    catch (error) {
        console.error('Tenant extraction error:', error);
        // Continue without tenant
        next();
    }
};
export default { extractTenant };
