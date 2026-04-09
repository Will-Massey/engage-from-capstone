"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTenant = void 0;
const database_js_1 = require("../config/database.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
// Simple tenant extraction - always use 'demo' for Render
const extractTenant = async (req, res, next) => {
    try {
        // For Render deployment, always use demo tenant
        // Try demo-practice first (older seeds), then demo (newer seeds)
        let tenant = await database_js_1.prisma.tenant.findFirst({
            where: {
                subdomain: 'demo-practice',
            },
        });
        if (!tenant) {
            tenant = await database_js_1.prisma.tenant.findFirst({
                where: {
                    subdomain: 'demo',
                },
            });
        }
        if (tenant) {
            req.tenantId = tenant.id;
            req.tenant = tenant;
            logger_js_1.default.debug(`Tenant extracted: ${tenant.subdomain} (${tenant.id}) for path: ${req.path}`);
            next();
        }
        else {
            logger_js_1.default.error(`No tenant found for request: ${req.path}`);
            res.status(503).json({
                success: false,
                error: {
                    code: 'TENANT_NOT_CONFIGURED',
                    message: 'Application not properly configured. Please contact support.',
                },
            });
        }
    }
    catch (error) {
        logger_js_1.default.error('Tenant extraction error:', error);
        // Continue without tenant
        next();
    }
};
exports.extractTenant = extractTenant;
exports.default = { extractTenant: exports.extractTenant };
//# sourceMappingURL=tenant-simple.js.map