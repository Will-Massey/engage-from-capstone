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
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ApiError('AI_EMPTY_RESPONSE', `${AI_COPILOT.name} returned an empty response`, 502);
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

  const aiCallsThisMonth = await prisma.activityLog.count({
    where: {
      tenantId,
      action: 'AI_FEATURE_USED',
      createdAt: { gte: monthStart },
    },
  });

  const usedThisMonth = aiCallsThisMonth * ESTIMATED_TOKENS_PER_AI_CALL;
  const remaining = Math.max(0, budgetMonthly - usedThisMonth);

  return {
    budgetMonthly,
    usedThisMonth,
    remaining,
    withinBudget: usedThisMonth < budgetMonthly,
    aiCallsThisMonth,
  };
}
