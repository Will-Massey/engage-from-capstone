/**
 * Client ID / AML self-service upload (GET/POST /api/onboarding/aml/:token).
 *
 * The client-facing page for this route showed "ID verification coming soon"
 * after partner AML checks were paused, although the upload API itself was
 * never switched off. These tests pin the contract the restored page relies
 * on: the portal token (unchanged format) resolves the client, uploads are
 * stored via fileStorage, the status moves to PENDING for the practice to
 * review, and CLEAR is never downgraded.
 */
import express from 'express';
import request from 'supertest';

const getClientByPortalToken = jest.fn();
const saveAmlDocument = jest.fn();
const clientUpdate = jest.fn();
const activityLogCreate = jest.fn();
const initiateAmlCheck = jest.fn();

jest.mock('../../services/proposalSharingService.js', () => ({
  getClientByPortalToken: (...args: unknown[]) => getClientByPortalToken(...args),
}));
jest.mock('../../services/fileStorage.js', () => ({
  saveAmlDocument: (...args: unknown[]) => saveAmlDocument(...args),
}));
jest.mock('../../services/amlService.js', () => ({
  getAmlPartnerConfig: jest.fn(() => ({ mode: 'demo' })),
  initiateAmlCheck: (...args: unknown[]) => initiateAmlCheck(...args),
}));
jest.mock('../../config/database.js', () => ({
  prisma: {
    client: { update: (...args: unknown[]) => clientUpdate(...args) },
    activityLog: { create: (...args: unknown[]) => activityLogCreate(...args) },
  },
}));
jest.mock('../../config/sentry.js', () => ({
  captureException: jest.fn(),
  initSentry: jest.fn(),
  Sentry: {},
}));

import onboardingRoutes from '../onboarding.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function app() {
  const a = express();
  a.use(express.json({ limit: '30mb' }));
  a.use('/api/onboarding', onboardingRoutes);
  a.use(errorHandler);
  return a;
}

function baseClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-1',
    tenantId: 'tenant-1',
    name: 'Paul Example',
    contactName: 'Paul Example',
    lifecycleStage: 'PROPOSAL_ACCEPTED',
    amlStatus: 'NOT_STARTED',
    amlSubmittedAt: null,
    amlCompletedAt: null,
    amlSubmissionData: null,
    tenant: { name: 'Fortis Example Practice', primaryColor: '#123456', logo: null },
    ...overrides,
  };
}

function validBody() {
  return {
    idDocumentType: 'PASSPORT',
    fullLegalName: 'Paul Example',
    dateOfBirth: '1980-01-01',
    registeredAddress: '1 High Street, Leeds, LS1 1AA',
    nationality: 'British',
    sourceOfFunds: 'Trading income',
    isPep: false,
    photoIdDocument: { fileName: 'passport.png', mimeType: 'image/png', data: TINY_PNG },
    proofOfAddressDocument: { fileName: 'bill.png', mimeType: 'image/png', data: TINY_PNG },
    confirmAccurate: true,
  };
}

beforeEach(() => {
  getClientByPortalToken.mockReset();
  saveAmlDocument.mockReset().mockImplementation((_t, _c, type: string, _d, fileName: string) =>
    Promise.resolve({
      relativePath: `aml-documents/tenant-1/client-1/${type}.png`,
      fileName,
      mimeType: 'image/png',
      sizeBytes: 68,
      uploadedAt: '2026-10-08T16:00:00.000Z',
    })
  );
  clientUpdate.mockReset().mockResolvedValue({});
  activityLogCreate.mockReset().mockResolvedValue({});
  initiateAmlCheck.mockReset();
});

describe('GET /api/onboarding/aml/:token', () => {
  it('returns practice + client context and current AML status for a valid portal token', async () => {
    getClientByPortalToken.mockResolvedValue(baseClient());
    const res = await request(app()).get('/api/onboarding/aml/tok_abc123');
    expect(res.status).toBe(200);
    expect(getClientByPortalToken).toHaveBeenCalledWith('tok_abc123');
    expect(res.body.data.practice.name).toBe('Fortis Example Practice');
    expect(res.body.data.client.name).toBe('Paul Example');
    expect(res.body.data.amlStatus).toBe('NOT_STARTED');
    expect(res.body.data.amlSubmittedAt).toBeNull();
  });

  it('404s for an unknown or expired token', async () => {
    getClientByPortalToken.mockResolvedValue(null);
    const res = await request(app()).get('/api/onboarding/aml/nope');
    expect(res.status).toBe(404);
  });

  it('never exposes storage paths in an existing submission', async () => {
    getClientByPortalToken.mockResolvedValue(
      baseClient({
        amlSubmittedAt: new Date('2026-10-08T16:00:00Z'),
        amlSubmissionData: JSON.stringify({
          fullLegalName: 'Paul Example',
          photoIdDocument: { relativePath: 'secret/path.png', fileName: 'passport.png' },
          proofOfAddressDocument: { relativePath: 'secret/bill.png', fileName: 'bill.png' },
        }),
      })
    );
    const res = await request(app()).get('/api/onboarding/aml/tok');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('secret/');
    expect(res.body.data.existingSubmission.photoIdDocument.fileName).toBe('passport.png');
  });
});

describe('POST /api/onboarding/aml/:token', () => {
  it('stores both documents and moves the client to PENDING (awaiting practice review)', async () => {
    getClientByPortalToken.mockResolvedValue(baseClient());
    const res = await request(app()).post('/api/onboarding/aml/tok').send(validBody());
    expect(res.status).toBe(200);
    expect(res.body.data.amlStatus).toBe('PENDING');

    expect(saveAmlDocument).toHaveBeenCalledTimes(2);
    expect(saveAmlDocument.mock.calls.map((c) => c[2])).toEqual(['photo_id', 'proof_of_address']);

    const update = clientUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'client-1' });
    expect(update.data.amlStatus).toBe('PENDING');
    expect(update.data.lifecycleStage).toBe('AML_PENDING');
    expect(update.data.amlSubmittedAt).toBeInstanceOf(Date);
    const stored = JSON.parse(update.data.amlSubmissionData);
    expect(stored.photoIdDocument.relativePath).toContain('photo_id');
    expect(stored.proofOfAddressDocument.relativePath).toContain('proof_of_address');

    expect(activityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CLIENT_AML_SUBMITTED' }),
      })
    );
    // Partner checks are paused: no provider call on submission.
    expect(initiateAmlCheck).not.toHaveBeenCalled();
  });

  it('lets a client re-upload after the practice refers it, back to PENDING', async () => {
    getClientByPortalToken.mockResolvedValue(baseClient({ amlStatus: 'REFER' }));
    const res = await request(app()).post('/api/onboarding/aml/tok').send(validBody());
    expect(res.status).toBe(200);
    expect(clientUpdate.mock.calls[0][0].data.amlStatus).toBe('PENDING');
  });

  it('does not downgrade CLEAR', async () => {
    getClientByPortalToken.mockResolvedValue(baseClient({ amlStatus: 'CLEAR' }));
    const res = await request(app()).post('/api/onboarding/aml/tok').send(validBody());
    expect(res.status).toBe(200);
    expect(clientUpdate.mock.calls[0][0].data.amlStatus).toBeUndefined();
  });

  it('rejects once AML is complete', async () => {
    getClientByPortalToken.mockResolvedValue(baseClient({ amlCompletedAt: new Date() }));
    const res = await request(app()).post('/api/onboarding/aml/tok').send(validBody());
    expect(res.status).toBe(400);
    expect(saveAmlDocument).not.toHaveBeenCalled();
  });

  it('rejects unsupported file types before storing anything', async () => {
    getClientByPortalToken.mockResolvedValue(baseClient());
    const body = validBody();
    (body.photoIdDocument as { mimeType: string }).mimeType = 'application/x-msdownload';
    const res = await request(app()).post('/api/onboarding/aml/tok').send(body);
    expect(res.status).toBe(400);
    expect(saveAmlDocument).not.toHaveBeenCalled();
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('surfaces storage validation errors (size / content mismatch) as 400', async () => {
    getClientByPortalToken.mockResolvedValue(baseClient());
    saveAmlDocument.mockRejectedValueOnce(new Error('File exceeds the 10 MB limit'));
    const res = await request(app()).post('/api/onboarding/aml/tok').send(validBody());
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('10 MB');
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('404s for an unknown or expired token', async () => {
    getClientByPortalToken.mockResolvedValue(null);
    const res = await request(app()).post('/api/onboarding/aml/nope').send(validBody());
    expect(res.status).toBe(404);
  });
});
