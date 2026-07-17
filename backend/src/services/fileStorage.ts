/**
 * File Storage Service for Uploads
 * Handles signature files and other uploads (local disk or Cloudflare R2).
 */

import { promises as fs } from 'fs';
import path from 'path';
import logger from '../config/logger.js';
import { r2DeleteObject, r2Enabled, r2GetObject, r2PutObject } from './r2Storage.js';
import { bufferMatchesMime, isPngBuffer } from '../utils/magicBytes.js';

function resolveUploadsDir(): string {
  if (process.env.UPLOADS_DIR) {
    return process.env.UPLOADS_DIR;
  }
  if (process.env.DATA_DIR) {
    return path.join(process.env.DATA_DIR, 'uploads');
  }
  return path.join(process.cwd(), 'uploads');
}

const UPLOADS_DIR = resolveUploadsDir();
const SIGNATURES_DIR = path.join(UPLOADS_DIR, 'signatures');
const AML_DOCUMENTS_DIR = path.join(UPLOADS_DIR, 'aml-documents');

const AML_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const AML_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function writeBytes(
  relativePath: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  if (r2Enabled()) {
    await r2PutObject(relativePath.replace(/\\/g, '/'), buffer, contentType);
    return;
  }
  const fullPath = path.join(UPLOADS_DIR, relativePath);
  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, buffer);
}

async function readBytes(relativePath: string): Promise<Buffer> {
  if (r2Enabled()) {
    return r2GetObject(relativePath.replace(/\\/g, '/'));
  }
  return fs.readFile(path.join(UPLOADS_DIR, relativePath));
}

async function deleteBytes(relativePath: string): Promise<void> {
  if (r2Enabled()) {
    await r2DeleteObject(relativePath.replace(/\\/g, '/'));
    return;
  }
  try {
    await fs.unlink(path.join(UPLOADS_DIR, relativePath));
  } catch {
    // file may not exist
  }
}

export async function saveSignaturePng(
  tenantId: string,
  proposalId: string,
  base64Data: string
): Promise<string> {
  try {
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const timestamp = Date.now();
    const filename = `${proposalId}_${timestamp}.png`;
    const relativePath = path.join('signatures', tenantId, filename);
    const buffer = Buffer.from(base64Content, 'base64');
    if (!isPngBuffer(buffer)) {
      throw new Error('Invalid signature image — PNG format required');
    }
    await writeBytes(relativePath, buffer, 'image/png');
    logger.info(`Signature saved: ${relativePath}`);
    return relativePath;
  } catch (error) {
    logger.error('Failed to save signature:', error);
    throw new Error('Failed to save signature file');
  }
}

export async function readSignature(filePath: string): Promise<string> {
  try {
    const buffer = await readBytes(filePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    logger.error('Failed to read signature:', error);
    throw new Error('Failed to read signature file');
  }
}

export async function deleteSignature(filePath: string): Promise<void> {
  try {
    await deleteBytes(filePath);
    logger.info(`Signature deleted: ${filePath}`);
  } catch (error) {
    logger.error('Failed to delete signature:', error);
  }
}

export function getFullPath(relativePath: string): string {
  return path.join(UPLOADS_DIR, relativePath);
}

export interface SavedAmlDocumentMeta {
  relativePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: 'application/octet-stream', base64: dataUrl };
}

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '.bin';
  }
}

export async function saveAmlDocument(
  tenantId: string,
  clientId: string,
  documentType: 'photo_id' | 'proof_of_address',
  dataUrl: string,
  originalFileName: string
): Promise<SavedAmlDocumentMeta> {
  const { mimeType, base64 } = parseDataUrl(dataUrl);

  if (!AML_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported file type. Please upload a JPEG, PNG, WebP, or PDF.');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new Error('Uploaded file is empty');
  }
  if (buffer.length > AML_MAX_FILE_BYTES) {
    throw new Error('File exceeds the 10 MB limit');
  }
  if (!bufferMatchesMime(buffer, mimeType)) {
    throw new Error('File content does not match its declared type');
  }

  const safeBase = originalFileName.replace(/[^\w.-]+/g, '_').slice(0, 80) || documentType;
  const filename = `${documentType}_${Date.now()}_${safeBase}${extensionForMime(mimeType)}`;
  const relativePath = path.join('aml-documents', tenantId, clientId, filename);
  await writeBytes(relativePath, buffer, mimeType);
  logger.info(`AML document saved: ${relativePath}`);

  return {
    relativePath,
    fileName: originalFileName,
    mimeType,
    sizeBytes: buffer.length,
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteAmlDocument(relativePath: string): Promise<void> {
  try {
    await deleteBytes(relativePath);
    logger.info(`AML document deleted: ${relativePath}`);
  } catch (error) {
    logger.error('Failed to delete AML document:', error);
  }
}

export default {
  saveSignaturePng,
  readSignature,
  deleteSignature,
  getFullPath,
  saveAmlDocument,
  deleteAmlDocument,
};
