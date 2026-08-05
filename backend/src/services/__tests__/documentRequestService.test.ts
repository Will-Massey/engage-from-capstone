/**
 * Document request lifecycle: create+send, resend guards, portal upload
 * attachment, auto-completion, and tenant scoping of every query.
 */
const prismaMock = {
  client: { findFirst: jest.fn() },
  job: { findFirst: jest.fn() },
  tenant: { findUnique: jest.fn() },
  documentRequest: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  documentRequestItem: { findFirst: jest.fn(), update: jest.fn() },
  portalFile: { update: jest.fn() },
  activityLog: { create: jest.fn() },
};

jest.mock('../../config/database.js', () => ({ prisma: prismaMock }));

const tenantMailerSendMock = jest.fn();
jest.mock('../tenantMailer.js', () => ({
  tenantMailerSend: (...args: unknown[]) => tenantMailerSendMock(...args),
}));

const createPortalLinkMock = jest.fn();
jest.mock('../proposalSharingService.js', () => ({
  createClientPortalLink: (...args: unknown[]) => createPortalLinkMock(...args),
}));

import {
  createDocumentRequest,
  resendDocumentRequest,
  listDocumentRequests,
  attachUploadToRequestItem,
  overrideItemStatus,
} from '../documentRequestService.js';

const baseRequest = {
  id: 'req1',
  title: 'Year-end records',
  message: null,
  status: 'OPEN',
  sentCount: 0,
  lastSentAt: null,
  completedAt: null,
  createdAt: new Date(),
  client: {
    id: 'c1',
    name: 'Acme Ltd',
    contactName: 'Ada',
    contactEmail: 'ada@acme.co.uk',
  },
  job: null,
  items: [
    { id: 'i1', name: 'Bank statements', required: true, status: 'PENDING', receivedAt: null },
    { id: 'i2', name: 'Payroll summary', required: false, status: 'PENDING', receivedAt: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.activityLog.create.mockResolvedValue({});
  createPortalLinkMock.mockResolvedValue({
    token: 'tok',
    portalUrl: 'https://x/portal/tok',
    expiresAt: new Date(),
  });
  tenantMailerSendMock.mockResolvedValue({ success: true, messageId: 'm1' });
});

describe('createDocumentRequest', () => {
  it('404s when the client is not in the tenant', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    await expect(
      createDocumentRequest({
        tenantId: 't1',
        clientId: 'c-other',
        title: 'X',
        items: [{ name: 'Doc' }],
        send: false,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-other', tenantId: 't1' }, select: { id: true } })
    );
  });

  it('creates, emails via the tenant mailer, and increments sentCount', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c1' });
    prismaMock.documentRequest.create.mockResolvedValue(baseRequest);
    prismaMock.tenant.findUnique.mockResolvedValue({ name: 'Smith & Co' });
    prismaMock.documentRequest.update.mockResolvedValue(baseRequest);
    prismaMock.documentRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      sentCount: 1,
      lastSentAt: new Date(),
    });

    const result = await createDocumentRequest({
      tenantId: 't1',
      clientId: 'c1',
      title: 'Year-end records',
      items: [{ name: 'Bank statements' }, { name: 'Payroll summary', required: false }],
      send: true,
    });

    expect(result.emailSent).toBe(true);
    expect(tenantMailerSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        messageType: 'DOCUMENT_REQUEST',
        message: expect.objectContaining({ to: 'ada@acme.co.uk' }),
      })
    );
    expect(prismaMock.documentRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sentCount: { increment: 1 } }),
      })
    );
    const html = tenantMailerSendMock.mock.calls[0][0].message.html as string;
    expect(html).toContain('https://x/portal/tok');
    expect(html).toContain('Bank statements');
  });

  it('rejects an empty item list', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c1' });
    await expect(
      createDocumentRequest({ tenantId: 't1', clientId: 'c1', title: 'X', items: [], send: false })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('409s when an open request with the same title exists for the client', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c1' });
    prismaMock.documentRequest.findFirst.mockResolvedValue({ id: 'req-existing' });
    await expect(
      createDocumentRequest({
        tenantId: 't1',
        clientId: 'c1',
        title: 'Year-end records',
        items: [{ name: 'Doc' }],
        send: false,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.documentRequest.create).not.toHaveBeenCalled();
  });
});

describe('resendDocumentRequest', () => {
  it('400s for non-open requests', async () => {
    prismaMock.documentRequest.findFirst.mockResolvedValue({
      ...baseRequest,
      status: 'CANCELLED',
    });
    await expect(
      resendDocumentRequest({ tenantId: 't1', requestId: 'req1' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('502s and does not increment when the email fails', async () => {
    prismaMock.documentRequest.findFirst.mockResolvedValue(baseRequest);
    prismaMock.tenant.findUnique.mockResolvedValue({ name: 'Smith & Co' });
    tenantMailerSendMock.mockResolvedValue({ success: false, error: 'suppressed' });
    await expect(
      resendDocumentRequest({ tenantId: 't1', requestId: 'req1' })
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(prismaMock.documentRequest.update).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the tenant', async () => {
    prismaMock.documentRequest.findFirst.mockResolvedValue(null);
    await expect(
      resendDocumentRequest({ tenantId: 't1', requestId: 'req-other-tenant' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.documentRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-other-tenant', tenantId: 't1' },
      })
    );
  });
});

describe('listDocumentRequests', () => {
  it('always filters by tenantId', async () => {
    prismaMock.documentRequest.findMany.mockResolvedValue([]);
    await listDocumentRequests({ tenantId: 't1', status: 'OPEN' });
    expect(prismaMock.documentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', status: 'OPEN' }),
      })
    );
  });
});

describe('attachUploadToRequestItem', () => {
  it('returns null when the item is not in an open request of this client', async () => {
    prismaMock.documentRequestItem.findFirst.mockResolvedValue(null);
    const result = await attachUploadToRequestItem({
      tenantId: 't1',
      clientId: 'c1',
      requestItemId: 'i-foreign',
      portalFileId: 'f1',
    });
    expect(result).toBeNull();
    expect(prismaMock.documentRequestItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'i-foreign',
          request: expect.objectContaining({ tenantId: 't1', clientId: 'c1', status: 'OPEN' }),
        }),
      })
    );
  });

  it('marks the item received and completes the request when required items are in', async () => {
    prismaMock.documentRequestItem.findFirst.mockResolvedValue({
      id: 'i1',
      name: 'Bank statements',
      request: { id: 'req1', title: 'Year-end records' },
    });
    prismaMock.portalFile.update.mockResolvedValue({});
    prismaMock.documentRequestItem.update.mockResolvedValue({});
    // completion check: required item now RECEIVED, optional still PENDING
    prismaMock.documentRequest.findFirst.mockResolvedValue({
      id: 'req1',
      status: 'OPEN',
      title: 'Year-end records',
      client: { name: 'Acme Ltd' },
      items: [
        { id: 'i1', required: true, status: 'RECEIVED' },
        { id: 'i2', required: false, status: 'PENDING' },
      ],
    });
    prismaMock.documentRequest.update.mockResolvedValue({});

    const result = await attachUploadToRequestItem({
      tenantId: 't1',
      clientId: 'c1',
      requestItemId: 'i1',
      portalFileId: 'f1',
    });

    expect(result).toEqual({ requestId: 'req1' });
    expect(prismaMock.documentRequestItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RECEIVED' }),
      })
    );
    expect(prismaMock.documentRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req1' },
        data: expect.objectContaining({ status: 'COMPLETE' }),
      })
    );
  });
});

describe('overrideItemStatus', () => {
  it('400s when the request is cancelled', async () => {
    prismaMock.documentRequestItem.findFirst.mockResolvedValue({
      id: 'i1',
      name: 'Bank statements',
      request: { id: 'req1', title: 'X', status: 'CANCELLED' },
    });
    await expect(
      overrideItemStatus({
        tenantId: 't1',
        requestId: 'req1',
        itemId: 'i1',
        status: 'RECEIVED',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
