"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEmailAutomation = runEmailAutomation;
exports.testEmailAutomation = testEmailAutomation;
const database_js_1 = require("../config/database.js");
const emailService_js_1 = require("../services/emailService.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
// Follow-up schedule
const FOLLOW_UP_SEQUENCE = [
    {
        daysAfterSend: 3,
        subject: 'Following up on your proposal',
        template: 'gentle',
    },
    {
        daysAfterSend: 7,
        subject: 'Have you had a chance to review your proposal?',
        template: 'gentle',
    },
    {
        daysAfterSend: 14,
        subject: 'Your proposal is still waiting for you',
        template: 'urgent',
    },
    {
        daysAfterSend: 30,
        subject: 'Final reminder: Your proposal expires soon',
        template: 'final',
    },
];
/**
 * Check if a proposal needs a follow-up email
 */
async function shouldSendFollowUp(proposalId, daysAfterSend) {
    // Check if we've already sent a follow-up for this proposal at this interval
    const existingLog = await database_js_1.prisma.activityLog.findFirst({
        where: {
            entityType: 'PROPOSAL',
            entityId: proposalId,
            action: 'FOLLOW_UP_SENT',
            description: {
                contains: `${daysAfterSend} days`,
            },
        },
    });
    return !existingLog;
}
/**
 * Get email template based on follow-up type
 */
function getEmailTemplate(template, proposal) {
    const clientName = proposal.client.name;
    const proposalTitle = proposal.title;
    const proposalRef = proposal.reference;
    const senderName = `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`;
    const senderPosition = proposal.createdBy.role;
    const practiceName = proposal.tenant.name;
    const frontendUrl = process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk';
    const viewLink = `${frontendUrl}/proposals/view/${proposal.shareToken || proposal.id}`;
    const totalAmount = new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
    }).format(proposal.total);
    switch (template) {
        case 'gentle':
            return {
                subject: `Following up on your proposal from ${practiceName}`,
                body: `
Dear ${clientName},

I hope this email finds you well.

I wanted to follow up on the proposal I sent you recently regarding "${proposalTitle}" (Reference: ${proposalRef}).

The proposal outlines services worth ${totalAmount} and is designed to help you achieve your business goals while ensuring full compliance.

If you have any questions or would like to discuss any aspects of the proposal, please don't hesitate to reach out. I'm here to help!

You can view the full proposal here: ${viewLink}

Best regards,
${senderName}
${senderPosition}
${practiceName}
        `.trim(),
            };
        case 'urgent':
            return {
                subject: `Reminder: Your proposal from ${practiceName}`,
                body: `
Dear ${clientName},

I hope you're doing well.

I wanted to reach out again regarding the proposal I sent for "${proposalTitle}" (Reference: ${proposalRef}).

I understand you're busy, and I don't want this to slip through the cracks. The proposal (${totalAmount}) is tailored specifically for your needs and includes:

${proposal.services.map((s) => `- ${s.name}`).join('\n')}

If you'd like to proceed or have any questions, please let me know. I'm happy to schedule a quick call to walk through anything.

View the proposal: ${viewLink}

Best regards,
${senderName}
${senderPosition}
${practiceName}
        `.trim(),
            };
        case 'final':
            return {
                subject: `Final reminder: Your proposal expires soon`,
                body: `
Dear ${clientName},

I hope this message finds you well.

This is a final reminder regarding the proposal "${proposalTitle}" (Reference: ${proposalRef}) that I sent you a while ago.

The proposal (${totalAmount}) will be expiring soon, and I wanted to make sure you had the opportunity to review it.

If you're no longer interested, no problem at all - just let me know so I can close this off. If you'd like to proceed or need any changes, I'm here to help.

View the proposal: ${viewLink}

Best regards,
${senderName}
${senderPosition}
${practiceName}

P.S. If you've decided to go in a different direction, I'd appreciate any feedback on how we could have better served your needs.
        `.trim(),
            };
        default:
            return {
                subject: `Following up on your proposal`,
                body: `Please review your proposal at ${viewLink}`,
            };
    }
}
/**
 * Send follow-up email for a single proposal
 */
async function sendFollowUp(proposal, config, emailService) {
    try {
        const { subject, body } = getEmailTemplate(config.template, proposal);
        const result = await emailService.sendEmail({
            to: proposal.client.contactEmail,
            subject,
            text: body,
            html: body.replace(/\n/g, '<br>'),
        });
        if (result.success) {
            // Log the follow-up
            await database_js_1.prisma.activityLog.create({
                data: {
                    tenantId: proposal.tenantId,
                    userId: proposal.createdById,
                    action: 'FOLLOW_UP_SENT',
                    entityType: 'PROPOSAL',
                    entityId: proposal.id,
                    description: `Sent ${config.template} follow-up email (${config.daysAfterSend} days after send)`,
                },
            });
            logger_js_1.default.info(`Follow-up email sent for proposal ${proposal.id} (${config.daysAfterSend} days)`);
            return true;
        }
        else {
            logger_js_1.default.error(`Failed to send follow-up for proposal ${proposal.id}: ${result.error}`);
            return false;
        }
    }
    catch (error) {
        logger_js_1.default.error(`Error sending follow-up for proposal ${proposal.id}:`, error);
        return false;
    }
}
/**
 * Main email automation job
 * Run this daily to send follow-up emails
 */
async function runEmailAutomation() {
    logger_js_1.default.info('Starting email automation job...');
    const stats = {
        sent: 0,
        failed: 0,
        skipped: 0,
    };
    try {
        // Initialize email service
        const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
        const emailConfig = {
            provider: emailProvider,
            fromName: process.env.EMAIL_FROM_NAME || 'Engage',
            fromEmail: process.env.EMAIL_FROM || 'noreply@engagebycapstone.co.uk',
        };
        if (emailProvider === 'smtp') {
            emailConfig.smtp = {
                host: process.env.SMTP_HOST || '',
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || '',
            };
        }
        // Skip if email not configured
        if (!emailConfig.smtp?.host && !emailConfig.sendgrid?.apiKey) {
            logger_js_1.default.warn('Email not configured, skipping automation');
            return { success: false, ...stats };
        }
        const emailService = new emailService_js_1.EmailService(emailConfig);
        // Get proposals that have been sent but not accepted/declined
        const now = new Date();
        const maxAge = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
        const proposals = await database_js_1.prisma.proposal.findMany({
            where: {
                status: { in: ['SENT', 'VIEWED'] },
                sentAt: {
                    gte: maxAge, // Not older than 35 days
                    lte: now,
                },
                publicAccessEnabled: true, // Must have public access enabled
            },
            include: {
                client: true,
                tenant: true,
                services: true,
                createdBy: {
                    select: {
                        firstName: true,
                        lastName: true,
                        role: true,
                    },
                },
            },
        });
        logger_js_1.default.info(`Found ${proposals.length} proposals for potential follow-up`);
        for (const proposal of proposals) {
            const daysSinceSent = Math.floor((now.getTime() - new Date(proposal.sentAt).getTime()) / (1000 * 60 * 60 * 24));
            // Find the appropriate follow-up stage
            const followUpConfig = FOLLOW_UP_SEQUENCE.find((config) => daysSinceSent >= config.daysAfterSend);
            if (!followUpConfig) {
                stats.skipped++;
                continue;
            }
            // Check if we already sent a follow-up at this stage
            const shouldSend = await shouldSendFollowUp(proposal.id, followUpConfig.daysAfterSend);
            if (!shouldSend) {
                stats.skipped++;
                continue;
            }
            // Send the follow-up email
            const sent = await sendFollowUp(proposal, followUpConfig, emailService);
            if (sent) {
                stats.sent++;
            }
            else {
                stats.failed++;
            }
            // Add small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        logger_js_1.default.info(`Email automation completed: ${stats.sent} sent, ${stats.failed} failed, ${stats.skipped} skipped`);
        return { success: true, ...stats };
    }
    catch (error) {
        logger_js_1.default.error('Email automation job failed:', error);
        return { success: false, ...stats };
    }
}
/**
 * Manual trigger for testing
 */
async function testEmailAutomation(proposalId) {
    try {
        const proposal = await database_js_1.prisma.proposal.findUnique({
            where: { id: proposalId },
            include: {
                client: true,
                tenant: true,
                services: true,
                createdBy: {
                    select: {
                        firstName: true,
                        lastName: true,
                        role: true,
                    },
                },
            },
        });
        if (!proposal) {
            logger_js_1.default.error(`Proposal ${proposalId} not found`);
            return false;
        }
        const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
        const emailConfig = {
            provider: emailProvider,
            fromName: process.env.EMAIL_FROM_NAME || 'Engage',
            fromEmail: process.env.EMAIL_FROM || 'noreply@engagebycapstone.co.uk',
        };
        if (emailProvider === 'smtp') {
            emailConfig.smtp = {
                host: process.env.SMTP_HOST || '',
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || '',
            };
        }
        const emailService = new emailService_js_1.EmailService(emailConfig);
        const config = {
            daysAfterSend: 3,
            subject: 'Test follow-up',
            template: 'gentle',
        };
        return await sendFollowUp(proposal, config, emailService);
    }
    catch (error) {
        logger_js_1.default.error('Test email automation failed:', error);
        return false;
    }
}
exports.default = runEmailAutomation;
//# sourceMappingURL=emailAutomation.js.map