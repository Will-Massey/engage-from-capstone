"use strict";
/**
 * Companies House API Routes
 * Provides company search and lookup endpoints
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const companiesHouse_js_1 = require("../services/companiesHouse.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
const router = (0, express_1.Router)();
/**
 * GET /api/companies-house/search
 * Search for companies by name or number
 */
router.get('/search', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        q: zod_1.z.string().min(1).max(100),
        limit: zod_1.z.string().regex(/^\d+$/).transform(Number).default('10'),
    });
    const { q, limit } = schema.parse(req.query);
    logger_js_1.default.info(`Companies House search for: ${q}, tenant: ${req.tenantId}`);
    // Check if service is configured
    const chService = (0, companiesHouse_js_1.createCompaniesHouseService)();
    if (!chService) {
        logger_js_1.default.error('Companies House API key not configured');
        throw new errorHandler_js_1.ApiError('NOT_CONFIGURED', 'Companies House API not configured. Please set COMPANIES_HOUSE_API_KEY environment variable.', 503);
    }
    try {
        const results = await chService.searchCompanies(q, limit);
        res.json({
            success: true,
            data: results.map(company => ({
                companyNumber: company.company_number,
                companyName: company.title || company.company_name, // Search returns 'title', details returns 'company_name'
                companyStatus: company.company_status,
                companyType: company.company_type,
                dateOfCreation: company.date_of_creation,
                address: company.registered_office_address || company.address,
            })),
            query: q,
        });
    }
    catch (error) {
        logger_js_1.default.error('Companies House search error:', error);
        throw new errorHandler_js_1.ApiError('SEARCH_FAILED', error.message || 'Failed to search Companies House', 500);
    }
}));
/**
 * GET /api/companies-house/company/:number
 * Get detailed company information
 */
router.get('/company/:number', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        number: zod_1.z.string().regex(/^[A-Za-z0-9]{6,8}$/, 'Invalid company number format'),
    });
    const { number } = schema.parse(req.params);
    // Check if service is configured
    const chService = (0, companiesHouse_js_1.createCompaniesHouseService)();
    if (!chService) {
        throw new errorHandler_js_1.ApiError('NOT_CONFIGURED', 'Companies House API not configured', 503);
    }
    try {
        const company = await chService.getCompanyDetails(number);
        const formatted = chService.formatForClientCreation(company);
        res.json({
            success: true,
            data: {
                raw: company,
                formatted: formatted,
            },
        });
    }
    catch (error) {
        logger_js_1.default.error('Companies House get details error:', error);
        if (error.message === 'Company not found') {
            throw new errorHandler_js_1.ApiError('COMPANY_NOT_FOUND', 'Company not found', 404);
        }
        throw new errorHandler_js_1.ApiError('FETCH_FAILED', error.message || 'Failed to fetch company details', 500);
    }
}));
/**
 * GET /api/companies-house/status
 * Check if Companies House API is configured and working
 */
router.get('/status', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const chService = (0, companiesHouse_js_1.createCompaniesHouseService)();
    if (!chService) {
        res.json({
            success: true,
            data: {
                configured: false,
                message: 'Companies House API key not configured',
            },
        });
        return;
    }
    // Test with a well-known company (e.g., "TEST COMPANY")
    try {
        await chService.searchCompanies('TEST', 1);
        res.json({
            success: true,
            data: {
                configured: true,
                connected: true,
                message: 'Companies House API is connected and working',
            },
        });
    }
    catch (error) {
        res.json({
            success: true,
            data: {
                configured: true,
                connected: false,
                message: error.message || 'Failed to connect to Companies House API',
            },
        });
    }
}));
exports.default = router;
//# sourceMappingURL=companiesHouse.js.map