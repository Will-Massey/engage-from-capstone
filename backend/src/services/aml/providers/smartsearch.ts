/**
 * SmartSearch AML provider — payloads, env vars, URLs, and error messages
 * unchanged from the pre-R2.1 amlService implementation. Env is read lazily so
 * configuration can vary per process (and per test) without module reloads.
 */

import { AmlPartnerApiError } from './types.js';
import type { AmlCheckProvider, AmlProviderSubmitInput, AmlProviderSubmitResult } from './types.js';
import { parseAmlSubmission, splitName } from './submission.js';

function smartsearchApiKey(): string | undefined {
  return process.env.SMARTSEARCH_API_KEY;
}

function smartsearchApiUrl(): string {
  return (
    process.env.SMARTSEARCH_API_URL ||
    (process.env.SMARTSEARCH_SANDBOX === 'false'
      ? 'https://api.smartsearch.com'
      : 'https://sandbox-api.smartsearch.com')
  );
}

async function submitSmartSearchCheck(
  params: AmlProviderSubmitInput
): Promise<AmlProviderSubmitResult> {
  const submission = parseAmlSubmission(params.client);
  const { forename, surname } = splitName(submission.fullLegalName);

  const body = {
    reference: params.ref,
    callback_url: params.webhookUrl,
    individual: {
      forename,
      surname,
      date_of_birth: submission.dateOfBirth,
      address: submission.registeredAddress,
      nationality: submission.nationality,
      email: params.client.contactEmail,
    },
    metadata: {
      client_id: params.client.id,
      client_name: params.client.name,
    },
  };

  const response = await fetch(`${smartsearchApiUrl()}/v2/identity-verifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${smartsearchApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Request-Id': params.ref,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: responseText.slice(0, 500) };
  }

  if (!response.ok) {
    const detail =
      (parsed.message as string) ||
      (parsed.error as string) ||
      `SmartSearch API returned ${response.status}`;
    throw new AmlPartnerApiError(detail, 'smartsearch', response.status);
  }

  const providerRef =
    (parsed.id as string) ||
    (parsed.reference as string) ||
    ((parsed.data as Record<string, unknown> | undefined)?.id as string) ||
    params.ref;

  return {
    providerRef: String(providerRef),
    message: 'AML check submitted to SmartSearch. Await webhook confirmation.',
  };
}

export const smartsearchProvider: AmlCheckProvider = {
  name: 'smartsearch',
  isConfigured: () => !!smartsearchApiKey(),
  submitCheck: submitSmartSearchCheck,
};
