import { listAmlDocuments, resolveAmlDocumentPath } from '../amlDocuments.js';

const submission = JSON.stringify({
  fullLegalName: 'Jane Doe',
  photoIdDocument: {
    relativePath: 'aml-documents/t1/c1/photo_id_123_passport.png',
    fileName: 'passport.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    uploadedAt: '2026-07-19T20:44:10.000Z',
  },
  proofOfAddressDocument: {
    relativePath: 'aml-documents/t1/c1/proof_of_address_456_bill.pdf',
    fileName: 'bill.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    uploadedAt: '2026-07-19T20:44:11.000Z',
  },
});

describe('listAmlDocuments', () => {
  it('returns public metadata for both documents without exposing paths', () => {
    const docs = listAmlDocuments(submission);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual({
      type: 'photo_id',
      fileName: 'passport.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      uploadedAt: '2026-07-19T20:44:10.000Z',
    });
    // no relativePath leaks
    expect(JSON.stringify(docs)).not.toContain('aml-documents/');
  });

  it('returns [] for null / malformed / empty submission data', () => {
    expect(listAmlDocuments(null)).toEqual([]);
    expect(listAmlDocuments('not json')).toEqual([]);
    expect(listAmlDocuments('{}')).toEqual([]);
  });

  it('skips a document whose relativePath is missing', () => {
    const partial = JSON.stringify({
      photoIdDocument: { relativePath: 'aml-documents/t1/c1/id.png', mimeType: 'image/png' },
      proofOfAddressDocument: { fileName: 'no-path.pdf' },
    });
    const docs = listAmlDocuments(partial);
    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe('photo_id');
  });
});

describe('resolveAmlDocumentPath', () => {
  it('resolves the storage path + mime for a requested type', () => {
    expect(resolveAmlDocumentPath(submission, 'proof_of_address')).toEqual({
      relativePath: 'aml-documents/t1/c1/proof_of_address_456_bill.pdf',
      mimeType: 'application/pdf',
      fileName: 'bill.pdf',
    });
  });

  it('returns null when the document or data is absent', () => {
    expect(resolveAmlDocumentPath(null, 'photo_id')).toBeNull();
    expect(resolveAmlDocumentPath('{}', 'photo_id')).toBeNull();
    expect(resolveAmlDocumentPath(JSON.stringify({ photoIdDocument: {} }), 'photo_id')).toBeNull();
  });
});
