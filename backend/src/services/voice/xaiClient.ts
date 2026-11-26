import {
  XAI_CLIENT_SECRET_URL,
  clientSecretRequestBody,
  redactSecret,
  resolveXaiApiKey,
} from './xaiConfig.js';
import { ApiError } from '../../middleware/errorHandler.js';

export async function mintRealtimeClientSecret(
  fetchImpl: typeof fetch = fetch
): Promise<{ value: string; expiresAt: number | null }> {
  const apiKey = resolveXaiApiKey();
  if (!apiKey) {
    throw new ApiError('VOICE_NOT_CONFIGURED', 'Voice is not configured on this server.', 503);
  }
  const body = clientSecretRequestBody();
  let response: Response;
  try {
    response = await fetchImpl(XAI_CLIENT_SECRET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Voice provider request failed';
    throw new ApiError('VOICE_PROVIDER', redactSecret(message, apiKey), 502);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(
      'VOICE_PROVIDER',
      redactSecret(`Voice provider refused the session (${response.status}).`, apiKey),
      502
    );
  }
  let parsed: { value?: unknown; expires_at?: unknown };
  try {
    parsed = JSON.parse(text) as { value?: unknown; expires_at?: unknown };
  } catch {
    throw new ApiError('VOICE_PROVIDER', 'Voice provider returned an unreadable session.', 502);
  }
  if (typeof parsed.value !== 'string' || !parsed.value || parsed.value === apiKey) {
    throw new ApiError('VOICE_PROVIDER', 'Voice provider did not return a client secret.', 502);
  }
  const expiresAt = typeof parsed.expires_at === 'number' ? parsed.expires_at : null;
  return { value: parsed.value, expiresAt };
}
