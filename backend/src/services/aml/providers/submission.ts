/**
 * Shared helpers for building provider payloads from the client's
 * self-service AML submission (amlSubmissionData JSON).
 */

export function splitName(fullName: string): { forename: string; surname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { forename: parts[0], surname: parts[0] };
  return { forename: parts[0], surname: parts.slice(1).join(' ') };
}

export function parseAmlSubmission(client: {
  amlSubmissionData: string | null;
  contactName: string | null;
  name: string;
}) {
  if (!client.amlSubmissionData) {
    return {
      fullLegalName: client.contactName || client.name,
      dateOfBirth: undefined as string | undefined,
      registeredAddress: undefined as string | undefined,
      nationality: undefined as string | undefined,
    };
  }
  try {
    const data = JSON.parse(client.amlSubmissionData) as Record<string, string>;
    return {
      fullLegalName: data.fullLegalName || client.contactName || client.name,
      dateOfBirth: data.dateOfBirth,
      registeredAddress: data.registeredAddress,
      nationality: data.nationality,
    };
  } catch {
    return {
      fullLegalName: client.contactName || client.name,
      dateOfBirth: undefined,
      registeredAddress: undefined,
      nationality: undefined,
    };
  }
}
