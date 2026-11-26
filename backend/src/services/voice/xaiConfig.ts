/**
 * xAI realtime settings for Engage voice.
 * The API key is read here and is never returned to the browser.
 *
 * Realtime docs (https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
 * and the live-interpreter cookbook) document `usage.billable_audio_seconds` on
 * `response.done` as seconds billed so far in the session. Token counts are not
 * documented on that event. If a usage object includes input_tokens, output_tokens,
 * or total_tokens, those numbers are stored. Nothing else is invented.
 */

export const XAI_REALTIME_URL = 'wss://api.x.ai/v1/realtime';
export const XAI_CLIENT_SECRET_URL = 'https://api.x.ai/v1/realtime/client_secrets';
export const XAI_VOICE_MODEL = 'grok-voice-latest';
export const DEFAULT_DAILY_CAP_MINUTES = 60;
export const DEFAULT_USD_PER_MINUTE = 0.08;
export const COST_BASIS = 'estimate' as const;
export const PENDING_CHANGE_MS = 2 * 60 * 1000;
export const CLIENT_SECRET_SECONDS = 300;

type Env = Record<string, string | undefined>;

export function resolveXaiApiKey(env: Env = process.env): string | null {
  const specific = env.ENGAGE_XAI_API_KEY?.trim();
  if (specific) return specific;
  const fallback = env.XAI_API_KEY?.trim();
  return fallback || null;
}

export function dailyCapEnabled(env: Env = process.env): boolean {
  const raw = (env.ENGAGE_VOICE_DAILY_CAP_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

export function dailyCapMinutes(env: Env = process.env): number {
  const n = Number(env.ENGAGE_VOICE_DAILY_CAP_MINUTES ?? DEFAULT_DAILY_CAP_MINUTES);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAILY_CAP_MINUTES;
  return n;
}

export function usdPerMinute(env: Env = process.env): number {
  const n = Number(env.ENGAGE_XAI_USD_PER_MINUTE ?? DEFAULT_USD_PER_MINUTE);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_USD_PER_MINUTE;
  return n;
}

export function estimateCostUsd(seconds: number, rate: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round((seconds / 60) * rate * 10000) / 10000;
}

/** Body for POST /v1/realtime/client_secrets. No session and no remote MCP. */
export function clientSecretRequestBody(): { expires_after: { seconds: number } } {
  return { expires_after: { seconds: CLIENT_SECRET_SECONDS } };
}

export function redactSecret(text: string, secret: string | null): string {
  if (!secret || !text) return text;
  return text.split(secret).join('[redacted]');
}

type UsageObject = Record<string, unknown>;

function asUsage(event: unknown): UsageObject | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as UsageObject;
  const usage = record.usage && typeof record.usage === 'object' ? record.usage : record;
  if (!usage || typeof usage !== 'object') return null;
  return usage as UsageObject;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type FoldedRealtimeUsage = {
  billableAudioSeconds: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

/**
 * billable_audio_seconds is cumulative ("seconds billed so far"), so the highest
 * value wins. Token fields, when present, take the last reported number.
 */
export function foldRealtimeUsage(events: unknown[]): FoldedRealtimeUsage {
  let billableAudioSeconds: number | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let totalTokens: number | null = null;
  for (const event of events) {
    const usage = asUsage(event);
    if (!usage) continue;
    const billed = num(usage.billable_audio_seconds);
    if (billed != null) billableAudioSeconds = Math.max(billableAudioSeconds ?? 0, billed);
    const input = num(usage.input_tokens) ?? num(usage.prompt_tokens);
    const output = num(usage.output_tokens) ?? num(usage.completion_tokens);
    const total = num(usage.total_tokens);
    if (input != null) inputTokens = Math.round(input);
    if (output != null) outputTokens = Math.round(output);
    if (total != null) totalTokens = Math.round(total);
  }
  return { billableAudioSeconds, inputTokens, outputTokens, totalTokens };
}

export function chargeableSeconds(input: {
  startedAt: Date;
  endedAt: Date | null;
  now: Date;
  billableAudioSeconds: number | null;
  storedSeconds: number;
}): number {
  const wall = input.endedAt
    ? Math.max(0, (input.endedAt.getTime() - input.startedAt.getTime()) / 1000)
    : Math.max(0, (input.now.getTime() - input.startedAt.getTime()) / 1000, input.storedSeconds);
  const billed = input.billableAudioSeconds ?? 0;
  return Math.max(wall, billed);
}

export function capAllows(
  usedSeconds: number,
  env: Env = process.env
): {
  allowed: boolean;
  capSeconds: number;
  remainingSeconds: number;
} {
  if (!dailyCapEnabled(env)) {
    return {
      allowed: true,
      capSeconds: dailyCapMinutes(env) * 60,
      remainingSeconds: Number.POSITIVE_INFINITY,
    };
  }
  const capSeconds = dailyCapMinutes(env) * 60;
  const remainingSeconds = Math.max(0, capSeconds - usedSeconds);
  return { allowed: usedSeconds < capSeconds, capSeconds, remainingSeconds };
}
