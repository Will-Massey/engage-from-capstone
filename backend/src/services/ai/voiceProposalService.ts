/**
 * Phase 5 stub — voice-to-proposal (mobile dictation → structured draft).
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

/** Turn a voice transcript into a structured proposal draft (Clara parses intent). */
export async function draftProposalFromVoice(
  tenantId: string,
  userId: string | undefined,
  params: { clientId: string; transcript: string }
): Promise<VoiceProposalDraft> {
  if (!isAiConfigured()) {
    throw new ApiError('AI_UNAVAILABLE', 'Clara is not configured on this environment', 503);
  }

  const transcript = params.transcript?.trim();
  if (!transcript || transcript.length < 20) {
    throw new ApiError('INVALID_INPUT', 'Please provide at least a short voice transcript', 400);
  }

  const ctx = await buildAiContext(tenantId, { clientId: params.clientId, userId });

  const prompt = `You are Clara, UK accountancy proposal assistant. The partner dictated the following scope for client "${ctx.client?.name}".

TRANSCRIPT:
${transcript}

CLIENT CONTEXT:
${JSON.stringify(
  {
    companyType: ctx.client?.companyType,
    turnover: ctx.client?.turnover,
    mtditsaStatus: ctx.client?.mtditsaStatus,
    catalogSample: ctx.catalog?.slice(0, 12).map((s) => s.name),
  },
  null,
  2
)}

Return JSON only:
{
  "title": "proposal title",
  "coverLetterTone": "PROFESSIONAL" | "FRIENDLY" | "MODERN",
  "coverLetter": "2-4 paragraphs UK English",
  "suggestedServices": [{ "name": "", "billingFrequency": "ANNUALLY|QUARTERLY|MONTHLY|ONE_OFF", "displayPrice": number or null, "rationale": "" }],
  "clarifyingQuestions": ["max 3 questions if scope unclear"]
}`;

  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content:
          AI_COPILOT.systemPersona +
          ' Use UK English. Return valid JSON only. Never invent fees without catalog context.',
      },
      { role: 'user', content: prompt },
    ],
    { jsonMode: true, temperature: 0.35, maxTokens: 2500 }
  );

  const parsed = parseJsonResponse<VoiceProposalDraft>(raw);

  await logAiUsage(tenantId, userId, 'voice_proposal', {
    clientId: params.clientId,
    transcriptLength: transcript.length,
    serviceCount: parsed.suggestedServices?.length ?? 0,
  });

  return parsed;
}