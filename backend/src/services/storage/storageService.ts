/**
 * Storage abstraction for portal files and job attachments.
 * Local FS in engage-practice; flip implementation to S3 on cutover without model changes.
 */
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

export interface StorageService {
  put(opts: {
    tenantId: string;
    originalName: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
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
    const base = path
      .basename(opts.originalName)
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const safeTenant = opts.tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const key = path.posix.join(safeTenant, `${randomUUID()}-${base || 'file'}`);
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

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }
}

let singleton: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!singleton) {
    singleton = new LocalFsStorageService();
  }
  return singleton;
}

/** Test helper */
export function setStorageServiceForTests(svc: StorageService | null) {
  singleton = svc;
}
