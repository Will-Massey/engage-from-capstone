"use strict";
/**
 * Renewal Reminder Background Job
 * Sends email notifications 30 days before proposal renewal dates
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRenewalDate = calculateRenewalDate;
exports.runRenewalReminders = runRenewalReminders;
exports.sendTestRenewalReminder = sendTestRenewalReminder;
const database_js_1 = require("../config/database.js");
const emailService_js_1 = require("../services/emailService.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
const REMINDER_DAYS = 30;
/**
 * Find proposals with renewals due in the reminder window
 */
async function findRenewalsDue() {
    const now = new Date();
    const reminderDate = new Date();
    reminderDate.setDate(now.getDate() + REMINDER_DAYS);
    // Find start and end of the reminder day (to catch all proposals due that day)
    const startOfDay = new Date(reminderDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(reminderDate);
    endOfDay.setHours(23, 59, 59, 999);
    const proposals = await database_js_1.prisma.proposal.findMany({
        where: {
            status: 'ACCEPTED',
            renewalDate: {
                gte: startOfDay,
                lte: endOfDay,
            },
            renewalReminderSent: false,
        },
        include: {
            client: {
                select: { name: true },
            },
            createdBy: {
                select: { email: true },
            },
            tenant: {
                select: { id: true, name: true },
            },
        },
    });
    return proposals;
}
/**
 * Calculate renewal date based on acceptance date
 * Sets renewal to 12 months from acceptance
 */
function calculateRenewalDate(acceptedAt) {
    const renewalDate = new Date(acceptedAt);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    return renewalDate;
}
/**
 * Update proposals that don't have renewal dates set
 * (migration for existing proposals)
 */
async function updateMissingRenewalDates() {
    const proposals = await database_js_1.prisma.proposal.findMany({
        where: {
            status: 'ACCEPTED',
            renewalDate: null,
            acceptedAt: { not: null },
        },
        select: { id: true, acceptedAt: true },
    });
    let updated = 0;
    for (const proposal of proposals) {
        if (proposal.acceptedAt) {
            const renewalDate = calculateRenewalDate(proposal.acceptedAt);
            await database_js_1.prisma.proposal.update({
                where: { id: proposal.id },
                data: { renewalDate },
            });
            updated++;
        }
    }
    if (updated > 0) {
        logger_js_1.default.info(`Updated ${updated} proposals with missing renewal dates`);
    }
    return updated;
}
/**
 * Send renewal reminder for a single proposal
 */
async function sendRenewalReminder(proposal) {
    try {
        if (!proposal.createdBy?.email) {
            logger_js_1.default.warn(`No email for proposal creator: ${proposal.id}`);
            return false;
        }
        const emailService = (0, emailService_js_1.createEmailService)();
        if (!emailService) {
            logger_js_1.default.error('Email service not configured');
            return false;
        }
        const { generateRenewalReminder } = await Promise.resolve().then(() => __importStar(require('../templates/renewalReminder.js')));
        const { html, text, subject } = generateRenewalReminder({
            clientName: proposal.client.name,
            proposalTitle: proposal.title,
            proposalReference: proposal.reference,
            renewalDate: proposal.renewalDate,
            originalAcceptedAt: proposal.acceptedAt,
            totalAmount: `£${proposal.total.toFixed(2)}`,
            daysUntilRenewal: REMINDER_DAYS,
            tenantName: proposal.tenant.name,
        });
        const result = await emailService.sendEmail({
            to: proposal.createdBy.email,
            subject,
            html,
            text,
        });
        if (result.success) {
            // Mark reminder as sent
            await database_js_1.prisma.proposal.update({
                where: { id: proposal.id },
                data: {
                    renewalReminderSent: true,
                    renewalReminderSentAt: new Date(),
                },
            });
            logger_js_1.default.info(`Renewal reminder sent for proposal ${proposal.reference}`);
            return true;
        }
        else {
            logger_js_1.default.error(`Failed to send renewal reminder: ${result.error}`);
            return false;
        }
    }
    catch (error) {
        logger_js_1.default.error(`Error sending renewal reminder for ${proposal.id}:`, error);
        return false;
    }
}
/**
 * Main job function - run daily
 */
async function runRenewalReminders() {
    logger_js_1.default.info('Running renewal reminder job...');
    const stats = { checked: 0, sent: 0, errors: 0 };
    try {
        // Update any proposals missing renewal dates
        await updateMissingRenewalDates();
        // Find renewals due
        const renewalsDue = await findRenewalsDue();
        stats.checked = renewalsDue.length;
        logger_js_1.default.info(`Found ${renewalsDue.length} proposals with renewals due in ${REMINDER_DAYS} days`);
        // Send reminders
        for (const proposal of renewalsDue) {
            const success = await sendRenewalReminder(proposal);
            if (success) {
                stats.sent++;
            }
            else {
                stats.errors++;
            }
        }
        logger_js_1.default.info(`Renewal reminder job completed: ${stats.sent} sent, ${stats.errors} errors`);
        return stats;
    }
    catch (error) {
        logger_js_1.default.error('Renewal reminder job failed:', error);
        throw error;
    }
}
/**
 * Manual trigger for testing
 */
async function sendTestRenewalReminder(proposalId) {
    const proposal = await database_js_1.prisma.proposal.findUnique({
        where: { id: proposalId },
        include: {
            client: { select: { name: true } },
            createdBy: { select: { email: true } },
            tenant: { select: { id: true, name: true } },
        },
    });
    if (!proposal || !proposal.renewalDate) {
        logger_js_1.default.error(`Proposal not found or no renewal date: ${proposalId}`);
        return false;
    }
    return sendRenewalReminder(proposal);
}
exports.default = {
    runRenewalReminders,
    sendTestRenewalReminder,
    calculateRenewalDate,
};
//# sourceMappingURL=renewalReminders.js.map