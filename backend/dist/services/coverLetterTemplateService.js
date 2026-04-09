"use strict";
/**
 * Cover Letter Template Service
 * Manages cover letter templates for proposals
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTemplates = getTemplates;
exports.getTemplateById = getTemplateById;
exports.createTemplate = createTemplate;
exports.updateTemplate = updateTemplate;
exports.deleteTemplate = deleteTemplate;
exports.renderCoverLetter = renderCoverLetter;
exports.seedDefaultTemplates = seedDefaultTemplates;
exports.getDefaultTemplate = getDefaultTemplate;
const database_js_1 = require("../config/database.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
const defaultCoverLetters_js_1 = require("../data/defaultCoverLetters.js");
/**
 * Get all templates for a tenant
 */
async function getTemplates(tenantId) {
    try {
        const templates = await database_js_1.prisma.coverLetterTemplate.findMany({
            where: { tenantId },
            orderBy: [
                { isDefault: 'desc' },
                { name: 'asc' },
            ],
        });
        return templates;
    }
    catch (error) {
        logger_js_1.default.error('Failed to get templates:', error);
        throw error;
    }
}
/**
 * Get a single template by ID
 */
async function getTemplateById(templateId, tenantId) {
    try {
        const template = await database_js_1.prisma.coverLetterTemplate.findFirst({
            where: { id: templateId, tenantId },
        });
        return template;
    }
    catch (error) {
        logger_js_1.default.error('Failed to get template:', error);
        throw error;
    }
}
/**
 * Create a new template
 */
async function createTemplate(tenantId, data, createdById) {
    try {
        // If this is set as default, unset any existing default
        if (data.isDefault) {
            await database_js_1.prisma.coverLetterTemplate.updateMany({
                where: { tenantId, isDefault: true },
                data: { isDefault: false },
            });
        }
        const template = await database_js_1.prisma.coverLetterTemplate.create({
            data: {
                tenantId,
                name: data.name,
                tone: data.tone,
                content: data.content,
                isDefault: data.isDefault || false,
                createdById,
            },
        });
        logger_js_1.default.info(`Created cover letter template: ${template.id}`);
        return template;
    }
    catch (error) {
        logger_js_1.default.error('Failed to create template:', error);
        throw error;
    }
}
/**
 * Update an existing template
 */
async function updateTemplate(templateId, tenantId, data) {
    try {
        // If this is being set as default, unset any existing default
        if (data.isDefault) {
            await database_js_1.prisma.coverLetterTemplate.updateMany({
                where: { tenantId, isDefault: true, id: { not: templateId } },
                data: { isDefault: false },
            });
        }
        const template = await database_js_1.prisma.coverLetterTemplate.update({
            where: { id: templateId },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.tone && { tone: data.tone }),
                ...(data.content && { content: data.content }),
                ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
            },
        });
        logger_js_1.default.info(`Updated cover letter template: ${templateId}`);
        return template;
    }
    catch (error) {
        logger_js_1.default.error('Failed to update template:', error);
        throw error;
    }
}
/**
 * Delete a template
 */
async function deleteTemplate(templateId, tenantId) {
    try {
        await database_js_1.prisma.coverLetterTemplate.delete({
            where: { id: templateId },
        });
        logger_js_1.default.info(`Deleted cover letter template: ${templateId}`);
        return true;
    }
    catch (error) {
        logger_js_1.default.error('Failed to delete template:', error);
        throw error;
    }
}
/**
 * Render a template with merge field data
 */
function renderCoverLetter(templateContent, data) {
    const mergeData = {
        clientName: data.clientName,
        tenantName: data.tenantName,
        serviceCount: String(data.serviceCount),
        monthlyTotal: data.monthlyTotal,
        senderName: data.senderName,
        senderPosition: data.senderPosition || '',
        proposalReference: data.proposalReference || '',
        proposalTitle: data.proposalTitle || '',
    };
    return (0, defaultCoverLetters_js_1.renderTemplate)(templateContent, mergeData);
}
/**
 * Seed default templates for a new tenant
 */
async function seedDefaultTemplates(tenantId) {
    try {
        const existingCount = await database_js_1.prisma.coverLetterTemplate.count({
            where: { tenantId },
        });
        if (existingCount > 0) {
            logger_js_1.default.info(`Tenant ${tenantId} already has templates, skipping seed`);
            return 0;
        }
        const created = await database_js_1.prisma.coverLetterTemplate.createMany({
            data: defaultCoverLetters_js_1.defaultCoverLetterTemplates.map((t) => ({
                tenantId,
                name: t.name,
                tone: t.tone,
                content: t.content,
                isDefault: t.isDefault,
                isSystem: t.isSystem,
            })),
        });
        logger_js_1.default.info(`Seeded ${created.count} default templates for tenant ${tenantId}`);
        return created.count;
    }
    catch (error) {
        logger_js_1.default.error('Failed to seed default templates:', error);
        throw error;
    }
}
/**
 * Get default template for a tenant
 */
async function getDefaultTemplate(tenantId) {
    try {
        const template = await database_js_1.prisma.coverLetterTemplate.findFirst({
            where: { tenantId, isDefault: true },
        });
        // If no default set, return the first template
        if (!template) {
            return database_js_1.prisma.coverLetterTemplate.findFirst({
                where: { tenantId },
                orderBy: { createdAt: 'asc' },
            });
        }
        return template;
    }
    catch (error) {
        logger_js_1.default.error('Failed to get default template:', error);
        throw error;
    }
}
exports.default = {
    getTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    renderCoverLetter,
    seedDefaultTemplates,
    getDefaultTemplate,
};
//# sourceMappingURL=coverLetterTemplateService.js.map