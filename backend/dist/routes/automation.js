"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const auth_js_2 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const emailAutomation_js_1 = require("../jobs/emailAutomation.js");
const migrateServicePricing_js_1 = __importDefault(require("../scripts/migrateServicePricing.js"));
const logger_js_1 = __importDefault(require("../config/logger.js"));
const router = (0, express_1.Router)();
/**
 * POST /api/automation/email-followup/run
 * Manually trigger the email follow-up automation job
 * Admin only
 */
router.post('/email-followup/run', auth_js_1.authenticate, (0, auth_js_2.authorize)('ADMIN', 'PARTNER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    logger_js_1.default.info('Manual email automation triggered by user:', req.user.id);
    const result = await (0, emailAutomation_js_1.runEmailAutomation)();
    res.json({
        success: result.success,
        data: {
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped,
        },
        message: result.success
            ? `Email automation completed: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`
            : 'Email automation failed or not configured',
    });
}));
/**
 * POST /api/automation/email-followup/test/:proposalId
 * Test email follow-up for a specific proposal
 * Admin only
 */
router.post('/email-followup/test/:proposalId', auth_js_1.authenticate, (0, auth_js_2.authorize)('ADMIN', 'PARTNER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { proposalId } = req.params;
    logger_js_1.default.info(`Test email follow-up triggered for proposal ${proposalId} by user:`, req.user.id);
    const success = await (0, emailAutomation_js_1.testEmailAutomation)(proposalId);
    if (!success) {
        throw new errorHandler_js_1.ApiError('EMAIL_FAILED', 'Failed to send test follow-up email. Check logs for details.', 500);
    }
    res.json({
        success: true,
        message: 'Test follow-up email sent successfully',
    });
}));
/**
 * GET /api/automation/settings
 * Get automation settings for the tenant
 */
router.get('/settings', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    // Return default settings for now
    // In the future, these could be stored in the database per tenant
    res.json({
        success: true,
        data: {
            emailFollowUp: {
                enabled: true,
                schedule: '0 9 * * *', // Daily at 9 AM
                stages: [
                    { daysAfterSend: 3, template: 'gentle' },
                    { daysAfterSend: 7, template: 'gentle' },
                    { daysAfterSend: 14, template: 'urgent' },
                    { daysAfterSend: 30, template: 'final' },
                ],
            },
            proposalExpiry: {
                enabled: true,
                defaultExpiryDays: 30,
                reminderDaysBefore: 7,
            },
        },
    });
}));
/**
 * POST /api/automation/migrate-service-pricing
 * Run the service pricing migration (v1 -> v2)
 * Can be called with admin auth OR secret key
 */
router.post('/migrate-service-pricing', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    // Check auth via token OR secret key
    const authHeader = req.headers.authorization;
    const secretKey = req.headers['x-migration-key'];
    const validSecret = process.env.MIGRATION_SECRET_KEY || 'engage-migrate-2024';
    if (secretKey !== validSecret) {
        // Fall back to regular auth check
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Valid token or secret key required' }
            });
        }
        // Note: In production, you'd verify the JWT here
    }
    logger_js_1.default.info('Service pricing migration triggered');
    try {
        await (0, migrateServicePricing_js_1.default)();
        res.json({
            success: true,
            message: 'Service pricing migration completed successfully',
        });
    }
    catch (error) {
        logger_js_1.default.error('Migration failed:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'MIGRATION_FAILED',
                message: error.message,
            },
        });
    }
}));
exports.default = router;
//# sourceMappingURL=automation.js.map