/**
 * Seed and ensure default lifecycle touchpoint templates per tenant.
 */
import { prisma } from '../config/database.js';
import {
  DEFAULT_TOUCHPOINT_TEMPLATES,
  type DefaultTouchpointTemplateDef,
} from '../data/defaultTouchpointTemplates.js';

export interface EnsureTouchpointTemplatesResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

function isPlaceholderOnly(body: string | null | undefined): boolean {
  if (!body?.trim()) return true;
  const stripped = body.replace(/<[^>]+>/g, '').trim();
  return stripped.length < 80;
}

export async function ensureTouchpointTemplatesForTenant(
  tenantId: string,
  options?: { fillMissingOnly?: boolean; upgradePlaceholders?: boolean }
): Promise<EnsureTouchpointTemplatesResult> {
  const fillMissingOnly = options?.fillMissingOnly !== false;
  const upgradePlaceholders = options?.upgradePlaceholders ?? true;

  const existing = await prisma.touchpointTemplate.findMany({
    where: { tenantId },
  });
  const byStage = new Map(existing.map((t) => [t.stage, t]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const def of DEFAULT_TOUCHPOINT_TEMPLATES) {
    const current = byStage.get(def.stage as never);

    if (!current) {
      await prisma.touchpointTemplate.create({
        data: {
          tenantId,
          stage: def.stage as never,
          subject: def.subject,
          body: def.body,
          tone: def.tone,
          isMarketing: def.isMarketing,
          isActive: true,
        },
      });
      created++;
      continue;
    }

    if (fillMissingOnly) {
      if (upgradePlaceholders && isPlaceholderOnly(current.body)) {
        await prisma.touchpointTemplate.update({
          where: { id: current.id },
          data: {
            subject: def.subject,
            body: def.body,
            tone: def.tone,
            isMarketing: def.isMarketing,
            isActive: current.isActive,
          },
        });
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    await prisma.touchpointTemplate.update({
      where: { id: current.id },
      data: {
        subject: def.subject,
        body: def.body,
        tone: def.tone,
        isMarketing: def.isMarketing,
      },
    });
    updated++;
  }

  const total = await prisma.touchpointTemplate.count({ where: { tenantId } });

  return { created, updated, skipped, total };
}

export function getDefaultTouchpointForStage(
  stage: string
): DefaultTouchpointTemplateDef | undefined {
  return DEFAULT_TOUCHPOINT_TEMPLATES.find((t) => t.stage === stage);
}

/** Overwrite a single stage with the Engage default wording (user customisations on other stages are untouched). */
export async function restoreTouchpointTemplateForStage(
  tenantId: string,
  stage: string
): Promise<{ stage: string; restored: boolean }> {
  const def = getDefaultTouchpointForStage(stage);
  if (!def) {
    return { stage, restored: false };
  }

  await prisma.touchpointTemplate.upsert({
    where: { tenantId_stage: { tenantId, stage: stage as never } },
    update: {
      subject: def.subject,
      body: def.body,
      tone: def.tone,
      isMarketing: def.isMarketing,
    },
    create: {
      tenantId,
      stage: stage as never,
      subject: def.subject,
      body: def.body,
      tone: def.tone,
      isMarketing: def.isMarketing,
      isActive: true,
    },
  });

  return { stage, restored: true };
}
