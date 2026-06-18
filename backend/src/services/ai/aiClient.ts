/**
 * LLM client — xAI (Grok) preferred for dev/testing, OpenAI as fallback.
 * Both use OpenAI-compatible chat/completions request/response shapes.
 */
import logger from '../../config/logger.js';
import { ApiError } from '../../middleware/errorHandler.js';

export type AiProvider = 'xai' | 'openai';

const PLACEHOLDER_PREFIXES = ['sk-your', 'xai-your', 'your_api', 'changeme'];

function isRealKey(key?: string | null): boolean {
  const k = key?.trim();
  if (!k || k.length < 10) return false;
  const lower = k.toLowerCase();
  return !PLACEHOLDER_PREFIXES.some((p) => lower.startsWith(p));
}

export function getAiProvider(): AiProvider | null {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === 'xai' && isRealKey(process.env.XAI_API_KEY)) return 'xai';
  if (forced === 'openai' && isRealKey(process.env.OPENAI_API_KEY)) return 'openai';

  // Default: xAI for testing when key is present, else OpenAI
  if (isRealKey(process.env.XAI_API_KEY)) return 'xai';
  if (isRealKey(process.env.OPENAI_API_KEY)) return 'openai';
  return null;
}

export function isAiConfigured(): boolean {
  return getAiProvider() !== null;
}

export function getAiModel(): string {
  const provider = getAiProvider();
  if (provider === 'xai') {
    return process.env.XAI_MODEL?.trim() || 'grok-3-mini';
  }
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

export function getAiStatusMeta(): { provider: AiProvider | null; model: string; configured: boolean } {
  const provider = getAiProvider();
  return {
    provider,
    model: provider ? getAiModel() : '',
    configured: provider !== null,
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function providerConfig(provider: AiProvider): { apiKey: string; baseUrl: string; label: string } {
  if (provider === 'xai') {
    return {
      apiKey: process.env.XAI_API_KEY!.trim(),
      baseUrl: (process.env.XAI_BASE_URL?.trim() || 'https://api.x.ai/v1').replace(/\/$/, ''),
      label: 'xAI',
    };
  }
  return {
    apiKey: process.env.OPENAI_API_KEY!.trim(),
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, ''),
    label: 'OpenAI',
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { jsonMode?: boolean; temperature?: number; maxTokens?: number }
): Promise<string> {
  const provider = getAiProvider();
  if (!provider) {
    throw new ApiError(
      'AI_NOT_CONFIGURED',
      'AI features require XAI_API_KEY or OPENAI_API_KEY on the server',
      503
    );
  }

  const { apiKey, baseUrl, label } = providerConfig(provider);
  const body: Record<string, unknown> = {
    model: getAiModel(),
    messages,
    temperature: options?.temperature ?? 0.4,
    max_tokens: options?.maxTokens ?? 4096,
  };

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.error(`${label} API error`, { status: res.status, body: errText.slice(0, 500) });
    throw new ApiError('AI_PROVIDER_ERROR', 'AI service temporarily unavailable', 502);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ApiError('AI_EMPTY_RESPONSE', 'AI returned an empty response', 502);
  }

  return content;
}

export function parseJsonResponse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new ApiError('AI_PARSE_ERROR', 'Could not parse AI response as JSON', 502);
  }
}
