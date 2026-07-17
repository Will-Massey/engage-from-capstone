/**
 * Creditsafe AML provider — payloads, env vars, URLs, and error messages
 * unchanged from the pre-R2.1 amlService implementation. Env is read lazily so
 * configuration can vary per process (and per test) without module reloads.
 */

import { AmlPartnerApiError } from './types.js';
import type { AmlCheckProvider, AmlProviderSubmitInput, AmlProviderSubmitResult } from './types.js';
import { parseAmlSubmission, splitName } from './submission.js';

function creditsafeApiKey(): string | undefined {
  return process.env.CREDITSAFE_API_KEY;
}

function creditsafeApiUrl(): string {
  return process.env.CREDITSAFE_API_URL || 'https://connect.sandbox.creditsafe.com/v1';
}

async function submitCreditsafeCheck(
  params: AmlProviderSubmitInput
): Promise<AmlProviderSubmitResult> {
  const submission = parseAmlSubmission(params.client);
  const { forename, surname } = splitName(submission.fullLegalName);

  const body = {
    reference: params.ref,
    webhookUrl: params.webhookUrl,
    person: {
      firstName: forename,
      lastName: surname,
      dateOfBirth: submission.dateOfBirth,
      address: submission.registeredAddress,
      nationality: submission.nationality,
      email: params.client.contactEmail,
    },
    externalReference: params.client.id,
  };

  const response = await fetch(`${creditsafeApiUrl()}/compliance/aml-checks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creditsafeApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
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
      `Creditsafe API returned ${response.status}`;
    throw new AmlPartnerApiError(detail, 'creditsafe', response.status);
  }

  const providerRef =
    (parsed.checkId as string) ||
    (parsed.id as string) ||
    ((parsed.data as Record<string, unknown> | undefined)?.checkId as string) ||
    params.ref;

  return {
    providerRef: String(providerRef),
    message: 'AML check submitted to Creditsafe. Await webhook confirmation.',
  };
}

export const creditsafeProvider: AmlCheckProvider = {
  name: 'creditsafe',
  isConfigured: () => !!creditsafeApiKey(),
  submitCheck: submitCreditsafeCheck,
};
