/**
 * Adfin Payment Integration Service
 * UK-based payment collection platform for accountancy practices
 * https://adfin.io
 */

import logger from '../config/logger.js';

const ADFIN_API_URL = process.env.ADFIN_API_URL || 'https://api.adfin.io/v1';
const ADFIN_API_KEY = process.env.ADFIN_API_KEY;
const ADFIN_WEBHOOK_SECRET = process.env.ADFIN_WEBHOOK_SECRET;

export interface AdfinPaymentRequest {
  amount: number; // in pence
  currency: 'GBP';
  description: string;
  reference: string;
  customer: {
    name: string;
    email: string;
    companyName?: string;
  };
  metadata?: Record<string, string>;
  // Payment options
  allowCard: boolean;
  allowOpenBanking: boolean;
  allowDirectDebit: boolean;
}

export interface AdfinPaymentResponse {
  id: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  checkoutUrl: string;
  reference: string;
  createdAt: string;
  expiresAt?: string;
}

export interface AdfinWebhookEvent {
  id: string;
  type: 'payment.completed' | 'payment.failed' | 'payment.cancelled' | 'refund.completed';
  data: {
    paymentId: string;
    reference: string;
    amount: number;
    status: string;
    paidAt?: string;
    failureReason?: string;
  };
  createdAt: string;
}

export class AdfinService {
  private apiKey: string;
  private webhookSecret: string;

  constructor(apiKey: string, webhookSecret: string) {
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret;
  }

  /**
   * Create a payment request (checkout session)
   */
  async createPayment(request: AdfinPaymentRequest): Promise<AdfinPaymentResponse> {
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

      const data = (await response.json()) as AdfinPaymentResponse;
      logger.info(`Adfin payment created: ${data.id}, reference: ${data.reference}`);
      return data;
    } catch (error) {
      logger.error('Failed to create Adfin payment:', error);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPayment(paymentId: string): Promise<AdfinPaymentResponse> {
    try {
      const response = await fetch(`${ADFIN_API_URL}/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Adfin API error: ${response.status}`);
      }

      return (await response.json()) as AdfinPaymentResponse;
    } catch (error) {
      logger.error('Failed to get Adfin payment:', error);
      throw error;
    }
  }

  /**
   * Cancel a pending payment
   */
  async cancelPayment(paymentId: string): Promise<void> {
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

      logger.info(`Adfin payment cancelled: ${paymentId}`);
    } catch (error) {
      logger.error('Failed to cancel Adfin payment:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    // In production, use crypto to verify HMAC signature
    // For now, simple comparison (implement proper HMAC in production)
    try {
      const expectedSignature = this.webhookSecret;
      return signature === expectedSignature;
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process webhook event
   */
  async processWebhook(event: AdfinWebhookEvent): Promise<void> {
    logger.info(`Processing Adfin webhook: ${event.type}, payment: ${event.data.paymentId}`);

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
        logger.warn(`Unhandled Adfin webhook type: ${event.type}`);
    }
  }

  private async handlePaymentCompleted(data: AdfinWebhookEvent['data']): Promise<void> {
    const { prisma } = await import('../config/database.js');

    await prisma.proposal.updateMany({
      where: { reference: data.reference },
      data: {
        paymentMandateId: data.paymentId,
        paymentProvider: 'adfin',
        paymentStatus: 'ACTIVE',
        paidAt: new Date(data.paidAt || Date.now()),
      },
    });

    logger.info(`Payment mandate activated for proposal: ${data.reference}`);
  }

  private async handlePaymentFailed(data: AdfinWebhookEvent['data']): Promise<void> {
    const { prisma } = await import('../config/database.js');

    await prisma.proposal.updateMany({
      where: { reference: data.reference },
      data: {
        paymentStatus: 'FAILED',
        paymentFailureReason: data.failureReason,
      },
    });

    logger.warn(`Payment failed for proposal: ${data.reference}, reason: ${data.failureReason}`);
  }

  private async handlePaymentCancelled(data: AdfinWebhookEvent['data']): Promise<void> {
    const { prisma } = await import('../config/database.js');

    await prisma.proposal.updateMany({
      where: { reference: data.reference },
      data: {
        paymentStatus: 'CANCELLED',
      },
    });

    logger.info(`Payment cancelled for proposal: ${data.reference}`);
  }
}

// Factory function
export function createAdfinService(): AdfinService | null {
  if (!ADFIN_API_KEY || !ADFIN_WEBHOOK_SECRET) {
    logger.warn('Adfin not configured - set ADFIN_API_KEY and ADFIN_WEBHOOK_SECRET');
    return null;
  }

  return new AdfinService(ADFIN_API_KEY, ADFIN_WEBHOOK_SECRET);
}

export default AdfinService;
