/**
 * AML document metadata helpers — parse the two uploaded documents out of the
 * Client.amlSubmissionData JSON blob (shape written by routes/onboarding.ts:
 * { photoIdDocument: {relativePath, fileName, mimeType, sizeBytes, uploadedAt}, ... }).
 *
 * Two views:
 *  - public metadata (name/size/type/uploadedAt) for the staff panel — NEVER paths
 *  - the storage relativePath, resolved server-side for the download route only
 */

export type AmlDocumentType = 'photo_id' | 'proof_of_address';

export interface AmlDocumentMeta {
  type: AmlDocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string | null;
}

interface StoredDoc {
  relativePath?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  uploadedAt?: unknown;
}

const FIELD_BY_TYPE: Record<AmlDocumentType, string> = {
  photo_id: 'photoIdDocument',
  proof_of_address: 'proofOfAddressDocument',
};

function parse(amlSubmissionData: string | null | undefined): Record<string, StoredDoc> | null {
  if (!amlSubmissionData) return null;
  try {
    const parsed = JSON.parse(amlSubmissionData);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Public metadata for both documents present in the submission (no paths). */
export function listAmlDocuments(amlSubmissionData: string | null | undefined): AmlDocumentMeta[] {
  const parsed = parse(amlSubmissionData);
  if (!parsed) return [];
  const out: AmlDocumentMeta[] = [];
  for (const type of Object.keys(FIELD_BY_TYPE) as AmlDocumentType[]) {
    const doc = parsed[FIELD_BY_TYPE[type]] as StoredDoc | undefined;
    if (!doc || typeof doc.relativePath !== 'string' || !doc.relativePath) continue;
    out.push({
      type,
      fileName: typeof doc.fileName === 'string' ? doc.fileName : `${type}.pdf`,
      mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : 'application/octet-stream',
      sizeBytes: typeof doc.sizeBytes === 'number' ? doc.sizeBytes : 0,
      uploadedAt: typeof doc.uploadedAt === 'string' ? doc.uploadedAt : null,
    });
  }
  return out;
}

/** Storage relativePath + mime for one document, or null if absent. Server-side only. */
export function resolveAmlDocumentPath(
  amlSubmissionData: string | null | undefined,
  type: AmlDocumentType
): { relativePath: string; mimeType: string; fileName: string } | null {
  const parsed = parse(amlSubmissionData);
  if (!parsed) return null;
  const doc = parsed[FIELD_BY_TYPE[type]] as StoredDoc | undefined;
  if (!doc || typeof doc.relativePath !== 'string' || !doc.relativePath) return null;
  return {
    relativePath: doc.relativePath,
    mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : 'application/octet-stream',
    fileName: typeof doc.fileName === 'string' ? doc.fileName : `${type}.pdf`,
  };
}
