/**
 * File Storage Service for Uploads
 * Handles signature files and other uploads
 */

import { promises as fs } from 'fs';
import path from 'path';
import logger from '../config/logger.js';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const SIGNATURES_DIR = path.join(UPLOADS_DIR, 'signatures');
const AML_DOCUMENTS_DIR = path.join(UPLOADS_DIR, 'aml-documents');

const AML_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const AML_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Save base64 signature as PNG file
 * @param tenantId - Tenant ID for organization
 * @param proposalId - Proposal ID
 * @param base64Data - Base64 encoded signature image (data:image/png;base64,...)
 * @returns File path relative to uploads directory
 */
export async function saveSignaturePng(
  tenantId: string,
  proposalId: string,
  base64Data: string
): Promise<string> {
  try {
    // Create tenant directory
    const tenantDir = path.join(SIGNATURES_DIR, tenantId);
    await ensureDir(tenantDir);

    // Extract base64 data (remove data:image/png;base64, prefix if present)
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    // Generate filename with timestamp
    const timestamp = Date.now();
    const filename = `${proposalId}_${timestamp}.png`;
    const filePath = path.join(tenantDir, filename);

    // Write file
    const buffer = Buffer.from(base64Content, 'base64');
    await fs.writeFile(filePath, buffer);

    // Return relative path for database storage
    const relativePath = path.join('signatures', tenantId, filename);
    logger.info(`Signature saved: ${relativePath}`);
    return relativePath;
  } catch (error) {
    logger.error('Failed to save signature:', error);
    throw new Error('Failed to save signature file');
  }
}

/**
 * Read signature file
 * @param filePath - Relative path from uploads directory
 * @returns Base64 encoded image data
 */
export async function readSignature(filePath: string): Promise<string> {
  try {
    const fullPath = path.join(UPLOADS_DIR, filePath);
    const buffer = await fs.readFile(fullPath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    logger.error('Failed to read signature:', error);
    throw new Error('Failed to read signature file');
  }
}

/**
 * Delete signature file
 * @param filePath - Relative path from uploads directory
 */
export async function deleteSignature(filePath: string): Promise<void> {
  try {
    const fullPath = path.join(UPLOADS_DIR, filePath);
    await fs.unlink(fullPath);
    logger.info(`Signature deleted: ${filePath}`);
  } catch (error) {
    logger.error('Failed to delete signature:', error);
    // Don't throw - file might not exist
  }
}

/**
 * Get full path for a file
 * @param relativePath - Relative path from uploads directory
 */
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

/**
 * Save AML onboarding document (photo ID or proof of address).
 */
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

  const tenantDir = path.join(AML_DOCUMENTS_DIR, tenantId, clientId);
  await ensureDir(tenantDir);

  const safeBase = originalFileName.replace(/[^\w.-]+/g, '_').slice(0, 80) || documentType;
  const filename = `${documentType}_${Date.now()}_${safeBase}${extensionForMime(mimeType)}`;
  const filePath = path.join(tenantDir, filename);
  await fs.writeFile(filePath, buffer);

  const relativePath = path.join('aml-documents', tenantId, clientId, filename);
  logger.info(`AML document saved: ${relativePath}`);

  return {
    relativePath,
    fileName: originalFileName,
    mimeType,
    sizeBytes: buffer.length,
    uploadedAt: new Date().toISOString(),
  };
}

export default {
  saveSignaturePng,
  readSignature,
  deleteSignature,
  getFullPath,
  saveAmlDocument,
};
