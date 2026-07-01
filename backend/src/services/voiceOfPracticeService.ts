/**
 * W4.4 — Voice of practice: per-tenant style hints from sample letters.
 */

import { prisma } from '../config/database.js';
import { chatCompletion, isAiConfigured } from './ai/aiClient.js';
import logger from '../utils/logger.js';

export interface VoiceOfPracticeSettings {
  sampleText?: string;
  styleHints?: string;
  updatedAt?: string;
  updatedByUserId?: string;
}

export async function getTenantSettingsJson(tenantId: string): Promise<Record<string, unknown>> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  return JSON.parse(tenant?.settings || '{}') as Record<string, unknown>;
}

export async function getVoiceOfPractice(tenantId: string): Promise<VoiceOfPracticeSettings | null> {
  const settings = await getTenantSettingsJson(tenantId);
  const vop = settings.voiceOfPractice as VoiceOfPracticeSettings | undefined;
  if (!vop?.styleHints && !vop?.sampleText) return null;
  return vop;
}

export async function getVoiceOfPracticePromptContext(tenantId: string): Promise<string> {
  const vop = await getVoiceOfPractice(tenantId);
  if (!vop?.styleHints?.trim()) return '';
  return `\nVoice of practice (match this firm's tone and phrasing):\n${vop.styleHints.trim()}\n`;
}

function heuristicStyleHints(sampleText: string): string {
  const words = sampleText.split(/\s+/).filter(Boolean);
  const sentences = sampleText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentence = sentences.length > 0 ? words.length / sentences.length : words.length;

  const traits: string[] = [];
  if (avgSentence < 14) traits.push('Use short, direct sentences.');
  else if (avgSentence > 22) traits.push('Use fuller, explanatory sentences.');
  else traits.push('Use balanced sentence length.');

  if (/\b(we're pleased|delighted|welcome)\b/i.test(sampleText)) {
    traits.push('Warm, welcoming opener.');
  }
  if (/\b(please do not hesitate|kind regards|yours sincerely)\b/i.test(sampleText)) {
    traits.push('Traditional professional sign-off.');
  }
  if (/\b(hi |hello )\b/i.test(sampleText)) {
    traits.push('Conversational greeting acceptable.');
  }

  return traits.join(' ');
}

export async function saveVoiceOfPracticeSample(
  tenantId: string,
  userId: string | undefined,
  sampleText: string
): Promise<VoiceOfPracticeSettings> {
  const trimmed = sampleText.trim().slice(0, 12000);
  if (trimmed.length < 80) {
    throw new Error('Sample letter must be at least 80 characters');
  }

  let styleHints = heuristicStyleHints(trimmed);

  if (isAiConfigured()) {
    try {
      const { content } = await chatCompletion(
        [
          {
            role: 'system',
            content:
              'You analyse UK accountancy practice letters. Output 4-6 bullet points describing tone, vocabulary, sentence style, and sign-off patterns. UK English. No preamble.',
          },
          {
            role: 'user',
            content: `Extract style hints from this sample letter:\n\n${trimmed.slice(0, 4000)}`,
          },
        ],
        { temperature: 0.3, maxTokens: 350 }
      );
      if (content?.trim()) {
        styleHints = content.trim();
      }
    } catch (err) {
      logger.warn('Voice of practice AI extraction failed; using heuristics', err);
    }
  }

  const voiceOfPractice: VoiceOfPracticeSettings = {
    sampleText: trimmed,
    styleHints,
    updatedAt: new Date().toISOString(),
    updatedByUserId: userId,
  };

  const settings = await getTenantSettingsJson(tenantId);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: JSON.stringify({
        ...settings,
        voiceOfPractice,
      }),
    },
  });

  return voiceOfPractice;
}