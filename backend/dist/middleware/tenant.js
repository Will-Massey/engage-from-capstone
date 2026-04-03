"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTenantMembership = exports.tenantHeader = exports.extractTenant = void 0;
const database_js_1 = require("../config/database.js");
// Extract tenant from subdomain
const extractTenant = async (req, res, next) => {
    try {
        // Get subdomain from request
        const host = req.headers.host || '';
        const subdomain = extractSubdomain(host);
        if (!subdomain) {
            // No subdomain - continue without tenant (routes can handle this)
            return next();
        }
        // Find tenant by subdomain
        const tenant = await database_js_1.prisma.tenant.findFirst({
            where: {
                subdomain,
                isActive: true,
            },
        });
        if (!tenant) {
            // Tenant not found - continue without tenant (routes can handle this)
            return next();
        }
        // Attach tenant to request
        req.tenantId = tenant.id;
        req.tenant = tenant;
        next();
    }
    catch (error) {
        console.error('Tenant extraction error:', error);
        // Continue without tenant on error
        next();
    }
};
exports.extractTenant = extractTenant;
// Extract subdomain from hostname
function extractSubdomain(hostname) {
    // Handle localhost:port
    if (hostname.includes('localhost')) {
        return 'demo'; // Default for local development
    }
    // Handle IP addresses
    if (/^\d+\.\d+\.\d+\.\d+/.test(hostname)) {
        return 'demo';
    }
    // Handle Railway domains - use default tenant
    if (hostname.includes('up.railway.app')) {
        return 'demo';
    }
    // Handle Render domains - use default tenant
    if (hostname.includes('onrender.com')) {
        return 'demo';
    }
    const parts = hostname.split('.');
    // Handle custom domain with subdomain
    if (parts.length >= 3) {
        return parts[0].toLowerCase();
    }
    // Handle custom domain without subdomain
    return null;
}
// Tenant header middleware (for API clients)
const tenantHeader = async (req, res, next) => {
    try {
        const tenantId = req.headers['x-tenant-id'];
        if (!tenantId) {
            // Fall back to subdomain extraction
            return (0, exports.extractTenant)(req, res, next);
        }
        // Verify tenant exists
        const tenant = await database_js_1.prisma.tenant.findFirst({
            where: {
                id: tenantId,
                isActive: true,
            },
        });
        if (!tenant) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'TENANT_NOT_FOUND',
                    message: 'Tenant not found or inactive',
                },
            });
            return;
        }
        req.tenantId = tenant.id;
        req.tenant = tenant;
        next();
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to extract tenant',
            },
        });
    }
};
exports.tenantHeader = tenantHeader;
// Validate user belongs to tenant
const validateTenantMembership = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            },
        });
        return;
    }
    if (req.user.tenantId !== req.tenantId) {
        res.status(403).json({
            success: false,
            error: {
                code: 'TENANT_MISMATCH',
                message: 'User does not belong to this tenant',
            },
        });
        return;
    }
    next();
};
exports.validateTenantMembership = validateTenantMembership;
exports.default = { extractTenant: exports.extractTenant, tenantHeader: exports.tenantHeader, validateTenantMembership: exports.validateTenantMembership };
//# sourceMappingURL=tenant.js.map