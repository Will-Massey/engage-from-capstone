/**
 * GDPR client-scoped erasure (Article 17): eraseClientData must clear Client
 * PII, redact the client's email-log recipients and signature image/PII, and
 * delete the stored AML documents + signature image files — while retaining the
 * signature rows/hashes for the legal audit trail (no hard deletes).
 */
const deleteAmlDocument = jest.fn().mockResolvedValue(undefined);
const deleteSignature = jest.fn().mockResolvedValue(undefined);

jest.mock('../fileStorage.js', () => ({
  deleteAmlDocument: (...args: unknown[]) => deleteAmlDocument(...args),
  deleteSignature: (...args: unknown[]) => deleteSignature(...args),
}));

import { GDPRService } from '../gdprService.js';

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  const clientUpdate = jest.fn().mockResolvedValue({});
  const emailLogUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
  const signatureUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const activityLogCreate = jest.fn().mockResolvedValue({});
  const prisma = {
    client: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'client-1',
        amlSubmissionData: JSON.stringify({
          photoIdDocument: { relativePath: 'aml-documents/t1/client-1/photo_id_1.jpg' },
          proofOfAddressDocument: { relativePath: 'aml-documents/t1/client-1/proof_2.pdf' },
        }),
      }),
      update: clientUpdate,
    },
    proposalSignature: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ signatureFilePath: 'signatures/t1/prop-1_123.png' }]),
      updateMany: signatureUpdateMany,
    },
    emailLog: { updateMany: emailLogUpdateMany },
    activityLog: { create: activityLogCreate },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
  return { prisma, clientUpdate, emailLogUpdateMany, signatureUpdateMany, activityLogCreate };
}

describe('GDPRService.eraseClientData', () => {
  beforeEach(() => {
    deleteAmlDocument.mockClear();
    deleteSignature.mockClear();
  });

  it('anonymizes client PII and deletes AML + signature files', async () => {
    const svc = new GDPRService();
    const { prisma, clientUpdate } = buildPrismaMock();

    const result = await svc.eraseClientData('t1', 'client-1', prisma);

    // PII cleared on the retained client row
    expect(clientUpdate).toHaveBeenCalledTimes(1);
    const updateData = clientUpdate.mock.calls[0][0].data;
    expect(updateData.contactEmail).toMatch(/@deleted\.local$/);
    expect(updateData.contactName).toBeNull();
    expect(updateData.contactPhone).toBeNull();
    expect(updateData.notes).toBeNull();
    expect(updateData.amlSubmissionData).toBeNull();
    expect(updateData.portalToken).toBeNull();

    // Both AML documents deleted from storage
    expect(deleteAmlDocument).toHaveBeenCalledWith('aml-documents/t1/client-1/photo_id_1.jpg');
    expect(deleteAmlDocument).toHaveBeenCalledWith('aml-documents/t1/client-1/proof_2.pdf');
    expect(deleteAmlDocument).toHaveBeenCalledTimes(2);

    // Signature image file deleted from storage
    expect(deleteSignature).toHaveBeenCalledWith('signatures/t1/prop-1_123.png');
    expect(deleteSignature).toHaveBeenCalledTimes(1);

    expect(result.success).toBe(true);
    expect(result.amlFilesDeleted).toBe(2);
    expect(result.signatureFilesDeleted).toBe(1);
  });

  it('redacts signature PII but retains the rows (no hard delete)', async () => {
    const svc = new GDPRService();
    const { prisma, signatureUpdateMany } = buildPrismaMock();

    await svc.eraseClientData('t1', 'client-1', prisma);

    expect(signatureUpdateMany).toHaveBeenCalledTimes(1);
    const sigData = signatureUpdateMany.mock.calls[0][0].data;
    expect(sigData.signerEmail).toBeNull();
    expect(sigData.signatureFilePath).toBeNull();
    expect(sigData.signatureData).toContain('REDACTED');
    // No proposalSignature.delete / deleteMany-as-delete path exists on the mock,
    // proving erasure retains the audit rows.
  });

  it('tolerates a client with no AML documents', async () => {
    const svc = new GDPRService();
    const { prisma } = buildPrismaMock({
      client: {
        findFirst: jest.fn().mockResolvedValue({ id: 'client-1', amlSubmissionData: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      proposalSignature: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });

    const result = await svc.eraseClientData('t1', 'client-1', prisma);

    expect(deleteAmlDocument).not.toHaveBeenCalled();
    expect(deleteSignature).not.toHaveBeenCalled();
    expect(result.amlFilesDeleted).toBe(0);
    expect(result.signatureFilesDeleted).toBe(0);
  });

  it('throws when the client is not found', async () => {
    const svc = new GDPRService();
    const { prisma } = buildPrismaMock({
      client: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    });

    await expect(svc.eraseClientData('t1', 'missing', prisma)).rejects.toThrow('Client not found');
  });
});
