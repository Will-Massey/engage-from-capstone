/**
 * LLM client — xAI (Grok) preferred for dev/testing, OpenAI as fallback.
 * Both use OpenAI-compatible chat/completions request/response shapes.
 */
import { prisma } from '../../config/database.js';
import { AI_COPILOT } from '../../config/aiCopilot.js';
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

export function getAiStatusMeta(): {
  provider: AiProvider | null;
  model: string;
  configured: boolean;
} {
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

export interface AiTokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: AiTokenUsage;
}

/** Merge provider token usage into activity-log metadata */
export function tokenMetaFromUsage(usage?: AiTokenUsage): Record<string, number> {
  const meta: Record<string, number> = {};
  if (usage?.prompt_tokens != null) meta.prompt_tokens = usage.prompt_tokens;
  if (usage?.completion_tokens != null) meta.completion_tokens = usage.completion_tokens;
  if (usage?.total_tokens != null) meta.total_tokens = usage.total_tokens;
  return meta;
}

/** Resolved token count for budget — prefers total, else prompt + completion */
export function resolvedTokenCount(meta: Record<string, unknown>): number | null {
  if (typeof meta.total_tokens === 'number' && meta.total_tokens > 0) return meta.total_tokens;
  const prompt = typeof meta.prompt_tokens === 'number' ? meta.prompt_tokens : 0;
  const completion = typeof meta.completion_tokens === 'number' ? meta.completion_tokens : 0;
  const sum = prompt + completion;
  if (sum > 0) return sum;
  if (typeof meta.prompt_tokens === 'number' && meta.prompt_tokens > 0) return meta.prompt_tokens;
  return null;
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
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    ),
    label: 'OpenAI',
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { jsonMode?: boolean; temperature?: number; maxTokens?: number }
): Promise<ChatCompletionResult> {
  const provider = getAiProvider();
  if (!provider) {
    throw new ApiError(
      'AI_NOT_CONFIGURED',
      `${AI_COPILOT.name} is not available on this server — contact your administrator`,
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
    throw new ApiError('AI_PROVIDER_ERROR', `${AI_COPILOT.name} is temporarily unavailable`, 502);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: AiTokenUsage;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ApiError('AI_EMPTY_RESPONSE', `${AI_COPILOT.name} returned an empty response`, 502);
  }

  const usage = data.usage;
  if (usage?.prompt_tokens != null) {
    logger.info('AI provider token usage', {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      model: getAiModel(),
      provider,
    });
  }

  return { content, usage };
}

/**
 * Streaming chat completion for live token-by-token drafts (cover letters, engagement intros etc).
 * Yields incremental content chunks. Does NOT support jsonMode (plain text only for UX).
 * Compatible with xAI and OpenAI streaming SSE format.
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): AsyncGenerator<string, void, unknown> {
  const provider = getAiProvider();
  if (!provider) {
    throw new ApiError(
      'AI_NOT_CONFIGURED',
      `${AI_COPILOT.name} is not available on this server — contact your administrator`,
      503
    );
  }

  const { apiKey, baseUrl, label } = providerConfig(provider);
  const body: Record<string, unknown> = {
    model: getAiModel(),
    messages,
    temperature: options?.temperature ?? 0.5,
    max_tokens: options?.maxTokens ?? 2000,
    stream: true,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    logger.error(`${label} stream error`, { status: res.status, body: errText.slice(0, 300) });
    throw new ApiError('AI_PROVIDER_ERROR', `${AI_COPILOT.name} stream unavailable`, 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE: split on double newlines for events
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') {
            return;
          }
          try {
            const json = JSON.parse(dataStr);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              yield delta;
            }
          } catch {
            // ignore partial JSON in stream
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

export function parseJsonResponse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new ApiError('AI_PARSE_ERROR', `Could not parse ${AI_COPILOT.name}'s response`, 502);
  }
}

const DEFAULT_AI_TOKEN_BUDGET_MONTHLY = 500_000;
/** Stub: estimated tokens per AI feature invocation for budget tracking */
const ESTIMATED_TOKENS_PER_AI_CALL = 2_500;

export interface AiTokenBudgetStatus {
  budgetMonthly: number;
  usedThisMonth: number;
  remaining: number;
  withinBudget: boolean;
  aiCallsThisMonth: number;
  /** Calls with logged provider token counts */
  callsWithLoggedTokens: number;
  /** Calls still estimated (legacy logs without token metadata) */
  callsEstimated: number;
}

function parseAiTokenBudget(settingsJson?: string | null): number {
  try {
    const parsed = JSON.parse(settingsJson || '{}');
    const budget = parsed.aiTokenBudgetMonthly;
    if (typeof budget === 'number' && budget > 0) return budget;
  } catch {
    /* use default */
  }
  return DEFAULT_AI_TOKEN_BUDGET_MONTHLY;
}

/** Check tenant AI token budget — usage stubbed from activity logs this month */
export async function checkAiTokenBudget(tenantId: string): Promise<AiTokenBudgetStatus> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  });

  const budgetMonthly = parseAiTokenBudget(tenant?.settings);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const aiLogs = await prisma.activityLog.findMany({
    where: {
      tenantId,
      action: 'AI_FEATURE_USED',
      createdAt: { gte: monthStart },
    },
    select: { metadata: true },
  });

  let usedThisMonth = 0;
  let callsWithLoggedTokens = 0;
  let callsEstimated = 0;

  for (const log of aiLogs) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(log.metadata || '{}') as Record<string, unknown>;
    } catch {
      /* treat as empty */
    }

    const tokens = resolvedTokenCount(meta);
    if (tokens != null) {
      usedThisMonth += tokens;
      callsWithLoggedTokens++;
    } else {
      usedThisMonth += ESTIMATED_TOKENS_PER_AI_CALL;
      callsEstimated++;
    }
  }

  const aiCallsThisMonth = aiLogs.length;
  const remaining = Math.max(0, budgetMonthly - usedThisMonth);

  return {
    budgetMonthly,
    usedThisMonth,
    remaining,
    withinBudget: usedThisMonth < budgetMonthly,
    aiCallsThisMonth,
    callsWithLoggedTokens,
    callsEstimated,
  };
}
