/**
 * Storage abstraction for portal files and job attachments.
 * Local FS in dev; Cloudflare R2 (S3-compatible) when UPLOADS_BACKEND=r2 —
 * Render's disk is ephemeral, so prod MUST run the R2 backend or client
 * documents are lost on every deploy.
 */
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { r2Enabled, r2PutObject, r2GetObject, r2DeleteObject } from '../r2Storage.js';

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

export interface StorageReadOptions {
  /** Defense-in-depth: assert the key belongs to this tenant before touching storage. */
  expectedTenantId?: string;
}

export interface StorageService {
  put(opts: {
    tenantId: string;
    originalName: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<StoredObject>;
  get(key: string, opts?: StorageReadOptions): Promise<Buffer>;
  delete(key: string, opts?: StorageReadOptions): Promise<void>;
}

/** The stored object no longer exists (wiped disk, deleted R2 object). */
export class StorageObjectMissingError extends Error {
  constructor(key: string) {
    super(`Stored object missing: ${key}`);
    this.name = 'StorageObjectMissingError';
  }
}

/** The key does not belong to the tenant asking for it. */
export class StorageAccessError extends Error {
  constructor(key: string) {
    super(`Storage key does not belong to the requesting tenant: ${key}`);
    this.name = 'StorageAccessError';
  }
}

const R2_PREFIX = 'portal-files';

/**
 * True when the key's tenant segment matches. Accepts both legacy local keys
 * (`<tenant>/<file>`) and namespaced R2 keys (`portal-files/<tenant>/<file>`).
 */
export function keyBelongsToTenant(key: string, tenantId: string): boolean {
  const parts = key.split('/').filter(Boolean);
  if (parts.length < 2) return false;
  const tenantSegment = parts[0] === R2_PREFIX ? parts[1] : parts[0];
  if (parts[0] === R2_PREFIX && parts.length < 3) return false;
  return tenantSegment === sanitizeTenant(tenantId);
}

function sanitizeTenant(tenantId: string): string {
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
}

function sanitizeName(originalName: string): string {
  const base = path
    .basename(originalName)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
  return base || 'file';
}

function assertTenant(key: string, opts?: StorageReadOptions): void {
  if (opts?.expectedTenantId && !keyBelongsToTenant(key, opts.expectedTenantId)) {
    throw new StorageAccessError(key);
  }
}

const ROOT =
  process.env.PRACTICE_STORAGE_ROOT || path.join(process.cwd(), '.data', 'practice-storage');

export class LocalFsStorageService implements StorageService {
  private root: string;

  constructor(root = ROOT) {
    this.root = root;
  }

  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  async put(opts: {
    tenantId: string;
    originalName: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<StoredObject> {
    const key = path.posix.join(
      sanitizeTenant(opts.tenantId),
      `${randomUUID()}-${sanitizeName(opts.originalName)}`
    );
    const full = this.resolveKey(key);
    await this.ensureDir(path.dirname(full));
    await fs.writeFile(full, opts.buffer);
    return { key, sizeBytes: opts.buffer.length };
  }

  /** Resolve storage key under root; reject path traversal. */
  private resolveKey(key: string): string {
    if (key.includes('..') || path.isAbsolute(key) || key.includes('\\')) {
      throw new Error('Invalid storage key');
    }
    const full = path.resolve(this.root, ...key.split('/'));
    const rootResolved = path.resolve(this.root);
    if (!full.startsWith(rootResolved + path.sep) && full !== rootResolved) {
      throw new Error('Storage key escapes root');
    }
    return full;
  }

  async get(key: string, opts?: StorageReadOptions): Promise<Buffer> {
    assertTenant(key, opts);
    try {
      return await fs.readFile(this.resolveKey(key));
    } catch (e: any) {
      if (e?.code === 'ENOENT') throw new StorageObjectMissingError(key);
      throw e;
    }
  }

  async delete(key: string, opts?: StorageReadOptions): Promise<void> {
    assertTenant(key, opts);
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }
}

export class R2StorageService implements StorageService {
  async put(opts: {
    tenantId: string;
    originalName: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<StoredObject> {
    const key = `${R2_PREFIX}/${sanitizeTenant(opts.tenantId)}/${randomUUID()}-${sanitizeName(
      opts.originalName
    )}`;
    await r2PutObject(key, opts.buffer, opts.mimeType);
    return { key, sizeBytes: opts.buffer.length };
  }

  async get(key: string, opts?: StorageReadOptions): Promise<Buffer> {
    assertTenant(key, opts);
    try {
      return await r2GetObject(key);
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) {
        throw new StorageObjectMissingError(key);
      }
      throw e;
    }
  }

  async delete(key: string, opts?: StorageReadOptions): Promise<void> {
    assertTenant(key, opts);
    await r2DeleteObject(key);
  }
}

let singleton: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!singleton) {
    singleton = r2Enabled() ? new R2StorageService() : new LocalFsStorageService();
  }
  return singleton;
}

/** Test helper */
export function setStorageServiceForTests(svc: StorageService | null) {
  singleton = svc;
}
