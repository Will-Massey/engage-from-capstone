import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const putMock = jest.fn();
const getMock = jest.fn();
const deleteMock = jest.fn();
let r2EnabledMock = jest.fn(() => false);

jest.mock('../../r2Storage.js', () => ({
  r2Enabled: () => r2EnabledMock(),
  r2PutObject: (...args: unknown[]) => putMock(...args),
  r2GetObject: (...args: unknown[]) => getMock(...args),
  r2DeleteObject: (...args: unknown[]) => deleteMock(...args),
}));

import {
  getStorageService,
  setStorageServiceForTests,
  LocalFsStorageService,
  R2StorageService,
  StorageObjectMissingError,
  StorageAccessError,
  keyBelongsToTenant,
} from '../storageService.js';

describe('storage backend selection', () => {
  afterEach(() => {
    setStorageServiceForTests(null);
    r2EnabledMock = jest.fn(() => false);
  });

  it('returns LocalFsStorageService when R2 is not enabled', () => {
    r2EnabledMock = jest.fn(() => false);
    expect(getStorageService()).toBeInstanceOf(LocalFsStorageService);
  });

  it('returns R2StorageService when UPLOADS_BACKEND=r2', () => {
    r2EnabledMock = jest.fn(() => true);
    expect(getStorageService()).toBeInstanceOf(R2StorageService);
  });
});

describe('keyBelongsToTenant', () => {
  it('accepts legacy local keys (<tenant>/<file>)', () => {
    expect(keyBelongsToTenant('tenant-a/abc-file.pdf', 'tenant-a')).toBe(true);
    expect(keyBelongsToTenant('tenant-a/abc-file.pdf', 'tenant-b')).toBe(false);
  });

  it('accepts namespaced R2 keys (portal-files/<tenant>/<file>)', () => {
    expect(keyBelongsToTenant('portal-files/tenant-a/abc-file.pdf', 'tenant-a')).toBe(true);
    expect(keyBelongsToTenant('portal-files/tenant-a/abc-file.pdf', 'tenant-b')).toBe(false);
  });

  it('rejects malformed keys', () => {
    expect(keyBelongsToTenant('', 'tenant-a')).toBe(false);
    expect(keyBelongsToTenant('portal-files/', 'tenant-a')).toBe(false);
  });
});

describe('R2StorageService', () => {
  beforeEach(() => {
    putMock.mockReset();
    getMock.mockReset();
    deleteMock.mockReset();
  });

  it('puts objects under portal-files/<tenant>/ with a uuid-prefixed safe name', async () => {
    putMock.mockResolvedValue(undefined);
    const svc = new R2StorageService();
    const { key, sizeBytes } = await svc.put({
      tenantId: 'tenant-a',
      originalName: 'Bank Statement (Jan).pdf',
      buffer: Buffer.from('hello'),
      mimeType: 'application/pdf',
    });
    expect(sizeBytes).toBe(5);
    expect(key).toMatch(/^portal-files\/tenant-a\/[0-9a-f-]{36}-Bank_Statement_Jan_?\.pdf$/);
    expect(putMock).toHaveBeenCalledWith(key, expect.any(Buffer), 'application/pdf');
  });

  it('gets objects and returns the buffer', async () => {
    getMock.mockResolvedValue(Buffer.from('data'));
    const svc = new R2StorageService();
    const buf = await svc.get('portal-files/tenant-a/abc-file.pdf', {
      expectedTenantId: 'tenant-a',
    });
    expect(buf.toString()).toBe('data');
  });

  it('rejects cross-tenant reads when expectedTenantId mismatches the key', async () => {
    const svc = new R2StorageService();
    await expect(
      svc.get('portal-files/tenant-a/abc-file.pdf', { expectedTenantId: 'tenant-b' })
    ).rejects.toBeInstanceOf(StorageAccessError);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('maps missing objects to StorageObjectMissingError', async () => {
    const noSuchKey = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    getMock.mockRejectedValue(noSuchKey);
    const svc = new R2StorageService();
    await expect(svc.get('portal-files/tenant-a/abc-file.pdf')).rejects.toBeInstanceOf(
      StorageObjectMissingError
    );
  });
});

describe('LocalFsStorageService', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'engage-storage-test-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips a file', async () => {
    const svc = new LocalFsStorageService(root);
    const { key } = await svc.put({
      tenantId: 'tenant-a',
      originalName: 'doc.txt',
      buffer: Buffer.from('content'),
      mimeType: 'text/plain',
    });
    const buf = await svc.get(key, { expectedTenantId: 'tenant-a' });
    expect(buf.toString()).toBe('content');
  });

  it('rejects cross-tenant reads when expectedTenantId mismatches the key', async () => {
    const svc = new LocalFsStorageService(root);
    const { key } = await svc.put({
      tenantId: 'tenant-a',
      originalName: 'doc.txt',
      buffer: Buffer.from('content'),
      mimeType: 'text/plain',
    });
    await expect(svc.get(key, { expectedTenantId: 'tenant-b' })).rejects.toBeInstanceOf(
      StorageAccessError
    );
  });

  it('maps a missing file to StorageObjectMissingError', async () => {
    const svc = new LocalFsStorageService(root);
    await expect(svc.get('tenant-a/does-not-exist.txt')).rejects.toBeInstanceOf(
      StorageObjectMissingError
    );
  });
});
