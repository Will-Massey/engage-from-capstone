"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTenant = void 0;
const database_js_1 = require("../config/database.js");
// Simple tenant extraction - always use 'demo' for Render
const extractTenant = async (req, res, next) => {
    try {
        // For Render deployment, always use demo tenant
        const tenant = await database_js_1.prisma.tenant.findFirst({
            where: {
                subdomain: 'demo-practice',
            },
        });
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
exports.extractTenant = extractTenant;
exports.default = { extractTenant: exports.extractTenant };
//# sourceMappingURL=tenant-simple.js.map