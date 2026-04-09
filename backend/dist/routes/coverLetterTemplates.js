"use strict";
/**
 * Cover Letter Template Routes
 * CRUD operations for cover letter templates
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const coverLetterTemplateService_js_1 = require("../services/coverLetterTemplateService.js");
const defaultCoverLetters_js_1 = require("../data/defaultCoverLetters.js");
const router = (0, express_1.Router)();
// Validation schemas
const createTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required'),
    tone: zod_1.z.nativeEnum(client_1.CoverLetterTone),
    content: zod_1.z.string().min(10, 'Content must be at least 10 characters'),
    isDefault: zod_1.z.boolean().optional(),
});
const updateTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    tone: zod_1.z.nativeEnum(client_1.CoverLetterTone).optional(),
    content: zod_1.z.string().min(10).optional(),
    isDefault: zod_1.z.boolean().optional(),
});
const previewSchema = zod_1.z.object({
    clientName: zod_1.z.string().default('ABC Ltd'),
    tenantName: zod_1.z.string().default('Your Practice'),
    serviceCount: zod_1.z.number().default(5),
    monthlyTotal: zod_1.z.string().default('£450.00'),
    senderName: zod_1.z.string().default('John Smith'),
    senderPosition: zod_1.z.string().default('Senior Accountant'),
    proposalReference: zod_1.z.string().optional().default(undefined),
    proposalTitle: zod_1.z.string().optional().default(undefined),
});
/**
 * GET /api/cover-letter-templates
 * Get all templates for tenant
 */
router.get('/', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const templates = await (0, coverLetterTemplateService_js_1.getTemplates)(req.tenantId);
    res.json({
        success: true,
        data: templates,
    });
}));
/**
 * GET /api/cover-letter-templates/merge-fields
 * Get available merge fields
 */
router.get('/merge-fields', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    res.json({
        success: true,
        data: defaultCoverLetters_js_1.coverLetterMergeFields,
    });
}));
/**
 * GET /api/cover-letter-templates/default
 * Get the default template for tenant
 */
router.get('/default', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const template = await (0, coverLetterTemplateService_js_1.getDefaultTemplate)(req.tenantId);
    if (!template) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'No templates found', 404);
    }
    res.json({
        success: true,
        data: template,
    });
}));
/**
 * GET /api/cover-letter-templates/:id
 * Get a single template
 */
router.get('/:id', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const template = await (0, coverLetterTemplateService_js_1.getTemplateById)(id, req.tenantId);
    if (!template) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Template not found', 404);
    }
    res.json({
        success: true,
        data: template,
    });
}));
/**
 * POST /api/cover-letter-templates
 * Create a new template
 */
router.post('/', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const data = createTemplateSchema.parse(req.body);
    const template = await (0, coverLetterTemplateService_js_1.createTemplate)(req.tenantId, data, req.user.id);
    res.status(201).json({
        success: true,
        data: template,
    });
}));
/**
 * PUT /api/cover-letter-templates/:id
 * Update a template
 */
router.put('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = updateTemplateSchema.parse(req.body);
    // Check template exists
    const existing = await (0, coverLetterTemplateService_js_1.getTemplateById)(id, req.tenantId);
    if (!existing) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Template not found', 404);
    }
    // Prevent editing system templates (optional - can be removed if you want to allow editing)
    if (existing.isSystem && !req.user?.role?.includes('ADMIN')) {
        throw new errorHandler_js_1.ApiError('FORBIDDEN', 'System templates can only be edited by admins', 403);
    }
    const template = await (0, coverLetterTemplateService_js_1.updateTemplate)(id, req.tenantId, data);
    res.json({
        success: true,
        data: template,
    });
}));
/**
 * DELETE /api/cover-letter-templates/:id
 * Delete a template
 */
router.delete('/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    // Check template exists
    const existing = await (0, coverLetterTemplateService_js_1.getTemplateById)(id, req.tenantId);
    if (!existing) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Template not found', 404);
    }
    // Prevent deleting system templates
    if (existing.isSystem) {
        throw new errorHandler_js_1.ApiError('FORBIDDEN', 'System templates cannot be deleted', 403);
    }
    await (0, coverLetterTemplateService_js_1.deleteTemplate)(id, req.tenantId);
    res.json({
        success: true,
        message: 'Template deleted successfully',
    });
}));
/**
 * POST /api/cover-letter-templates/:id/preview
 * Preview a template with merge fields
 */
router.post('/:id/preview', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const previewData = previewSchema.parse(req.body);
    const template = await (0, coverLetterTemplateService_js_1.getTemplateById)(id, req.tenantId);
    if (!template) {
        throw new errorHandler_js_1.ApiError('NOT_FOUND', 'Template not found', 404);
    }
    const rendered = (0, coverLetterTemplateService_js_1.renderCoverLetter)(template.content, previewData);
    res.json({
        success: true,
        data: {
            original: template.content,
            rendered,
        },
    });
}));
/**
 * POST /api/cover-letter-templates/preview
 * Preview raw content with merge fields (without saving)
 */
router.post('/preview', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        content: zod_1.z.string().min(1, 'Content is required'),
        previewData: previewSchema,
    });
    const { content, previewData } = schema.parse(req.body);
    const typedPreviewData = previewData;
    const rendered = (0, coverLetterTemplateService_js_1.renderCoverLetter)(content, typedPreviewData);
    res.json({
        success: true,
        data: {
            original: content,
            rendered,
        },
    });
}));
exports.default = router;
//# sourceMappingURL=coverLetterTemplates.js.map