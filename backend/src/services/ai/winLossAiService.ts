/**
 * Win/loss AI — optional single classify call when client declines with reason=OTHER + free text.
 */
import logger from '../../config/logger.js';
import { chatCompletion, isAiConfigured, parseJsonResponse } from './aiClient.js';
import { DECLINE_REASONS, type DeclineReason } from '../../constants/declineReasons.js';

const CLASSIFY_SYSTEM =
  'You classify UK accountancy proposal decline feedback into exactly one category. ' +
  'Categories: PRICE (fees too high, budget), SCOPE (services missing/wrong), ' +
  'TIMING (not ready, delayed decision), COMPETITOR (chose another firm), OTHER (none of the above). ' +
  'Return JSON only: { "category": "PRICE"|"SCOPE"|"TIMING"|"COMPETITOR"|"OTHER" }';

/**
 * Classify free-text decline feedback. Returns null if AI unavailable or parse fails.
 * Never throws — decline flow must succeed without AI.
 */
export async function classifyDeclineReasonText(freeText: string): Promise<DeclineReason | null> {
  const trimmed = freeText.trim();
  if (!trimmed || !isAiConfigured()) return null;

  try {
    const { content: raw } = await chatCompletion(
      [
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: trimmed.slice(0, 1000) },
      ],
      { jsonMode: true, temperature: 0, maxTokens: 64 }
    );

    const parsed = parseJsonResponse<{ category?: string }>(raw);
    const category = parsed.category?.toUpperCase();
    if (category && (DECLINE_REASONS as readonly string[]).includes(category)) {
      return category as DeclineReason;
    }
  } catch (err) {
    logger.warn('Decline reason AI classify failed', { err });
  }

  return null;
}
