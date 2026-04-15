"use strict";
/**
 * Adfin Payment Integration Service
 * UK-based payment collection platform for accountancy practices
 * https://adfin.io
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
exports.AdfinService = void 0;
exports.createAdfinService = createAdfinService;
const logger_js_1 = __importDefault(require("../config/logger.js"));
const ADFIN_API_URL = process.env.ADFIN_API_URL || 'https://api.adfin.io/v1';
const ADFIN_API_KEY = process.env.ADFIN_API_KEY;
const ADFIN_WEBHOOK_SECRET = process.env.ADFIN_WEBHOOK_SECRET;
class AdfinService {
    constructor(apiKey, webhookSecret) {
        this.apiKey = apiKey;
        this.webhookSecret = webhookSecret;
    }
    /**
     * Create a payment request (checkout session)
     */
    async createPayment(request) {
        try {
            const response = await fetch(`${ADFIN_API_URL}/payments`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Adfin API error: ${response.status} - ${error}`);
            }
            const data = (await response.json());
            logger_js_1.default.info(`Adfin payment created: ${data.id}, reference: ${data.reference}`);
            return data;
        }
        catch (error) {
            logger_js_1.default.error('Failed to create Adfin payment:', error);
            throw error;
        }
    }
    /**
     * Get payment status
     */
    async getPayment(paymentId) {
        try {
            const response = await fetch(`${ADFIN_API_URL}/payments/${paymentId}`, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });
            if (!response.ok) {
                throw new Error(`Adfin API error: ${response.status}`);
            }
            return (await response.json());
        }
        catch (error) {
            logger_js_1.default.error('Failed to get Adfin payment:', error);
            throw error;
        }
    }
    /**
     * Cancel a pending payment
     */
    async cancelPayment(paymentId) {
        try {
            const response = await fetch(`${ADFIN_API_URL}/payments/${paymentId}/cancel`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });
            if (!response.ok) {
                throw new Error(`Adfin API error: ${response.status}`);
            }
            logger_js_1.default.info(`Adfin payment cancelled: ${paymentId}`);
        }
        catch (error) {
            logger_js_1.default.error('Failed to cancel Adfin payment:', error);
            throw error;
        }
    }
    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(payload, signature) {
        // In production, use crypto to verify HMAC signature
        // For now, simple comparison (implement proper HMAC in production)
        try {
            const expectedSignature = this.webhookSecret;
            return signature === expectedSignature;
        }
        catch (error) {
            logger_js_1.default.error('Webhook signature verification failed:', error);
            return false;
        }
    }
    /**
     * Process webhook event
     */
    async processWebhook(event) {
        logger_js_1.default.info(`Processing Adfin webhook: ${event.type}, payment: ${event.data.paymentId}`);
        switch (event.type) {
            case 'payment.completed':
                await this.handlePaymentCompleted(event.data);
                break;
            case 'payment.failed':
                await this.handlePaymentFailed(event.data);
                break;
            case 'payment.cancelled':
                await this.handlePaymentCancelled(event.data);
                break;
            default:
                logger_js_1.default.warn(`Unhandled Adfin webhook type: ${event.type}`);
        }
    }
    async handlePaymentCompleted(data) {
        // Update proposal payment status in database
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database.js')));
        await prisma.proposal.updateMany({
            where: { reference: data.reference },
            data: {
                status: 'ACCEPTED',
                paymentStatus: 'PAID',
                paidAt: new Date(data.paidAt || Date.now()),
            },
        });
        logger_js_1.default.info(`Payment completed for proposal: ${data.reference}`);
    }
    async handlePaymentFailed(data) {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database.js')));
        await prisma.proposal.updateMany({
            where: { reference: data.reference },
            data: {
                paymentStatus: 'FAILED',
                paymentFailureReason: data.failureReason,
            },
        });
        logger_js_1.default.warn(`Payment failed for proposal: ${data.reference}, reason: ${data.failureReason}`);
    }
    async handlePaymentCancelled(data) {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database.js')));
        await prisma.proposal.updateMany({
            where: { reference: data.reference },
            data: {
                paymentStatus: 'CANCELLED',
            },
        });
        logger_js_1.default.info(`Payment cancelled for proposal: ${data.reference}`);
    }
}
exports.AdfinService = AdfinService;
// Factory function
function createAdfinService() {
    if (!ADFIN_API_KEY || !ADFIN_WEBHOOK_SECRET) {
        logger_js_1.default.warn('Adfin not configured - set ADFIN_API_KEY and ADFIN_WEBHOOK_SECRET');
        return null;
    }
    return new AdfinService(ADFIN_API_KEY, ADFIN_WEBHOOK_SECRET);
}
exports.default = AdfinService;
//# sourceMappingURL=adfin.js.map