/**
 * Cover Letter Template Service
 * Manages cover letter templates for proposals
 */

import { prisma } from '../config/database.js';
import { CoverLetterTone } from '@prisma/client';
import logger from '../config/logger.js';
import { defaultCoverLetterTemplates, renderTemplate } from '../data/defaultCoverLetters.js';

export interface CreateTemplateInput {
  name: string;
  tone: CoverLetterTone;
  content: string;
  isDefault?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  tone?: CoverLetterTone;
  content?: string;
  isDefault?: boolean;
}

/**
 * Get all templates for a tenant
 */
export async function getTemplates(tenantId: string) {
  try {
    const templates = await prisma.coverLetterTemplate.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return templates;
  } catch (error) {
    logger.error('Failed to get templates:', error);
    throw error;
  }
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(templateId: string, tenantId: string) {
  try {
    const template = await prisma.coverLetterTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    return template;
  } catch (error) {
    logger.error('Failed to get template:', error);
    throw error;
  }
}

/**
 * Create a new template
 */
export async function createTemplate(
  tenantId: string,
  data: CreateTemplateInput,
  createdById?: string
) {
  try {
    // If this is set as default, unset any existing default
    if (data.isDefault) {
      await prisma.coverLetterTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.coverLetterTemplate.create({
      data: {
        tenantId,
        name: data.name,
        tone: data.tone,
        content: data.content,
        isDefault: data.isDefault || false,
        createdById,
      },
    });

    logger.info(`Created cover letter template: ${template.id}`);
    return template;
  } catch (error) {
    logger.error('Failed to create template:', error);
    throw error;
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(
  templateId: string,
  tenantId: string,
  data: UpdateTemplateInput
) {
  try {
    // If this is being set as default, unset any existing default
    if (data.isDefault) {
      await prisma.coverLetterTemplate.updateMany({
        where: { tenantId, isDefault: true, id: { not: templateId } },
        data: { isDefault: false },
      });
    }

    const template = await prisma.coverLetterTemplate.update({
      where: { id: templateId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.tone && { tone: data.tone }),
        ...(data.content && { content: data.content }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });

    logger.info(`Updated cover letter template: ${templateId}`);
    return template;
  } catch (error) {
    logger.error('Failed to update template:', error);
    throw error;
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(templateId: string, tenantId: string) {
  try {
    await prisma.coverLetterTemplate.delete({
      where: { id: templateId },
    });

    logger.info(`Deleted cover letter template: ${templateId}`);
    return true;
  } catch (error) {
    logger.error('Failed to delete template:', error);
    throw error;
  }
}

/**
 * Render a template with merge field data
 */
export function renderCoverLetter(
  templateContent: string,
  data: {
    clientName: string;
    tenantName: string;
    serviceCount: number;
    monthlyTotal: string;
    senderName: string;
    senderPosition?: string;
    proposalReference?: string;
    proposalTitle?: string;
  }
): string {
  const mergeData: Record<string, string> = {
    clientName: data.clientName,
    tenantName: data.tenantName,
    serviceCount: String(data.serviceCount),
    monthlyTotal: data.monthlyTotal,
    senderName: data.senderName,
    senderPosition: data.senderPosition || '',
    proposalReference: data.proposalReference || '',
    proposalTitle: data.proposalTitle || '',
  };

  return renderTemplate(templateContent, mergeData);
}

/**
 * Seed default templates for a new tenant
 */
export async function seedDefaultTemplates(tenantId: string): Promise<number> {
  try {
    const existingCount = await prisma.coverLetterTemplate.count({
      where: { tenantId },
    });

    if (existingCount > 0) {
      logger.info(`Tenant ${tenantId} already has templates, skipping seed`);
      return 0;
    }

    const created = await prisma.coverLetterTemplate.createMany({
      data: defaultCoverLetterTemplates.map((t) => ({
        tenantId,
        name: t.name,
        tone: t.tone,
        content: t.content,
        isDefault: t.isDefault,
        isSystem: t.isSystem,
      })),
    });

    logger.info(`Seeded ${created.count} default templates for tenant ${tenantId}`);
    return created.count;
  } catch (error) {
    logger.error('Failed to seed default templates:', error);
    throw error;
  }
}

/**
 * Get default template for a tenant
 */
export async function getDefaultTemplate(tenantId: string) {
  try {
    const template = await prisma.coverLetterTemplate.findFirst({
      where: { tenantId, isDefault: true },
    });

    // If no default set, return the first template
    if (!template) {
      return prisma.coverLetterTemplate.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
      });
    }

    return template;
  } catch (error) {
    logger.error('Failed to get default template:', error);
    throw error;
  }
}

export default {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  renderCoverLetter,
  seedDefaultTemplates,
  getDefaultTemplate,
};
