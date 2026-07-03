/**
 * Phase 5 stub — voice-to-proposal (mobile dictation → structured draft). Cheap low-token basic draft support.
 * Accepts transcript text; full speech pipeline ships later.
 */
import { chatCompletion, parseJsonResponse, isAiConfigured } from './aiClient.js';
import { buildAiContext } from './aiContextBuilder.js';
import { logAiUsage } from './proposalAiService.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';

export interface VoiceProposalDraft {
  title: string;
  coverLetterTone: 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';
  coverLetter: string;
  suggestedServices: Array<{
    name: string;
    billingFrequency: string;
    displayPrice?: number;
    rationale: string;
  }>;
  clarifyingQuestions: string[];
}

/** Turn a voice transcript into a structured proposal draft (Clara parses intent). Cheap low-token version. */
export async function draftProposalFromVoice(
  tenantId: string,
  userId: string | undefined,
  params: { clientId: string; transcript: string }
): Promise<VoiceProposalDraft> {
  const transcript = params.transcript?.trim() || '';
  if (!transcript || transcript.length < 10) {
    throw new ApiError('INVALID_INPUT', 'Please provide at least a short voice transcript', 400);
  }

  // cheap basic structured draft for simple input (or when not configured)
  if (!isAiConfigured() || transcript.length < 40) {
    const basicTitle = transcript.split(/[.,\n]/)[0].slice(0, 55).trim() || 'Proposal from voice';
    await logAiUsage(tenantId, userId, 'voice_proposal', { clientId: params.clientId, cheap: true });
    return {
      title: basicTitle,
      coverLetterTone: 'PROFESSIONAL',
      coverLetter: `Thank you. We outline the proposed ${basicTitle.toLowerCase()} below.`,
      suggestedServices: [{ name: 'Core accountancy services', billingFrequency: 'MONTHLY', displayPrice: undefined, rationale: 'Derived from voice input' }],
      clarifyingQuestions: ['Please confirm key details or billing?'],
    };
  }

  const ctx = await buildAiContext(tenantId, { clientId: params.clientId, userId });

  const prompt = `Clara cheap voice→UK proposal. Transcript: ${transcript.slice(0, 500)}
Client: ${ctx.client?.name || ''} (${ctx.client?.companyType || ''})
Return JSON: { "title": "max 8 words", "coverLetterTone": "PROFESSIONAL", "coverLetter": "2 short UK paras", "suggestedServices": [{"name": "", "billingFrequency": "MONTHLY", "displayPrice": null, "rationale": ""}], "clarifyingQuestions": [] }`;

  const { content: raw } = await chatCompletion(
    [
      { role: 'system', content: AI_COPILOT.systemPersona + ' UK English. Valid JSON. Tiny.' },
      { role: 'user', content: prompt },
    ],
    { jsonMode: true, temperature: 0.3, maxTokens: 420 }
  );

  const parsed = parseJsonResponse<VoiceProposalDraft>(raw);

  await logAiUsage(tenantId, userId, 'voice_proposal', {
    clientId: params.clientId,
    transcriptLength: transcript.length,
    serviceCount: parsed.suggestedServices?.length ?? 0,
  });

  return parsed;
}