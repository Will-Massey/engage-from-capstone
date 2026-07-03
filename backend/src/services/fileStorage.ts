/**
 * File Storage Service for Uploads
 * Handles signature files and other uploads
 */

import { promises as fs } from 'fs';
import path from 'path';
import logger from '../config/logger.js';

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

export default {
  saveSignaturePng,
  readSignature,
  deleteSignature,
  getFullPath,
};
