"use strict";
/**
 * File Storage Service for Uploads
 * Handles signature files and other uploads
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSignaturePng = saveSignaturePng;
exports.readSignature = readSignature;
exports.deleteSignature = deleteSignature;
exports.getFullPath = getFullPath;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const logger_js_1 = __importDefault(require("../config/logger.js"));
const UPLOADS_DIR = process.env.UPLOADS_DIR || path_1.default.join(process.cwd(), 'uploads');
const SIGNATURES_DIR = path_1.default.join(UPLOADS_DIR, 'signatures');
/**
 * Ensure directory exists
 */
async function ensureDir(dir) {
    try {
        await fs_1.promises.access(dir);
    }
    catch {
        await fs_1.promises.mkdir(dir, { recursive: true });
    }
}
/**
 * Save base64 signature as PNG file
 * @param tenantId - Tenant ID for organization
 * @param proposalId - Proposal ID
 * @param base64Data - Base64 encoded signature image (data:image/png;base64,...)
 * @returns File path relative to uploads directory
 */
async function saveSignaturePng(tenantId, proposalId, base64Data) {
    try {
        // Create tenant directory
        const tenantDir = path_1.default.join(SIGNATURES_DIR, tenantId);
        await ensureDir(tenantDir);
        // Extract base64 data (remove data:image/png;base64, prefix if present)
        const base64Content = base64Data.includes(',')
            ? base64Data.split(',')[1]
            : base64Data;
        // Generate filename with timestamp
        const timestamp = Date.now();
        const filename = `${proposalId}_${timestamp}.png`;
        const filePath = path_1.default.join(tenantDir, filename);
        // Write file
        const buffer = Buffer.from(base64Content, 'base64');
        await fs_1.promises.writeFile(filePath, buffer);
        // Return relative path for database storage
        const relativePath = path_1.default.join('signatures', tenantId, filename);
        logger_js_1.default.info(`Signature saved: ${relativePath}`);
        return relativePath;
    }
    catch (error) {
        logger_js_1.default.error('Failed to save signature:', error);
        throw new Error('Failed to save signature file');
    }
}
/**
 * Read signature file
 * @param filePath - Relative path from uploads directory
 * @returns Base64 encoded image data
 */
async function readSignature(filePath) {
    try {
        const fullPath = path_1.default.join(UPLOADS_DIR, filePath);
        const buffer = await fs_1.promises.readFile(fullPath);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    }
    catch (error) {
        logger_js_1.default.error('Failed to read signature:', error);
        throw new Error('Failed to read signature file');
    }
}
/**
 * Delete signature file
 * @param filePath - Relative path from uploads directory
 */
async function deleteSignature(filePath) {
    try {
        const fullPath = path_1.default.join(UPLOADS_DIR, filePath);
        await fs_1.promises.unlink(fullPath);
        logger_js_1.default.info(`Signature deleted: ${filePath}`);
    }
    catch (error) {
        logger_js_1.default.error('Failed to delete signature:', error);
        // Don't throw - file might not exist
    }
}
/**
 * Get full path for a file
 * @param relativePath - Relative path from uploads directory
 */
function getFullPath(relativePath) {
    return path_1.default.join(UPLOADS_DIR, relativePath);
}
exports.default = {
    saveSignaturePng,
    readSignature,
    deleteSignature,
    getFullPath,
};
//# sourceMappingURL=fileStorage.js.map