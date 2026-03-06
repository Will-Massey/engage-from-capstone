import { prisma } from '../config/database.js';
import { Prisma, PricingModel } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';

// Pricing calculation result
interface PricingCalculation {
  basePrice: number;
  complexityMultiplier: number;
  volumeDiscount: number;
  geographicAdjustment: number;
  adjustments: PricingAdjustment[];
  finalPrice: number;
  annualValue: number;
  margin: number;
  breakdown: PricingBreakdown;
}

interface PricingAdjustment {
  ruleId: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  amount: number;
}

interface PricingBreakdown {
  directCosts: number;
  indirectCosts: number;
  overheadAllocation: number;
  targetMargin: number;
  minimumPrice: number;
}

// Geographic multipliers based on ONS regional cost data
const GEOGRAPHIC_MULTIPLIERS: Record<string, number> = {
  'LONDON': 1.25,
  'SOUTH_EAST': 1.15,
  'SOUTH_WEST': 1.05,
  'EAST': 1.1,
  'WEST_MIDLANDS': 0.95,
  'EAST_MIDLANDS': 0.9,
  'YORKSHIRE': 0.9,
  'NORTH_WEST': 0.95,
  'NORTH_EAST': 0.85,
  'WALES': 0.9,
  'SCOTLAND': 0.95,
  'NORTHERN_IRELAND': 0.85,
};

// Complexity factor definitions
interface ComplexityFactor {
  name: string;
  description: string;
  multiplier: number;
}

export class PricingEngine {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Calculate price for a service
   */
  async calculatePrice(
    serviceId: string,
    clientData: {
      turnover?: number;
      employeeCount?: number;
      transactionVolume?: number;
      region?: string;
      recordQuality?: 'GOOD' | 'AVERAGE' | 'POOR';
      software?: string;
    },
    options: {
      quantity?: number;
      targetMargin?: number;
      frequency?: string;
    } = {}
  ): Promise<PricingCalculation> {
    // Get service template
    const service = await prisma.serviceTemplate.findFirst({
      where: {
        id: serviceId,
        tenantId: this.tenantId,
        isActive: true,
      },
      include: {
        pricingRules: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
      },
    });

    if (!service) {
      throw new ApiError('SERVICE_NOT_FOUND', 'Service template not found', 404);
    }

    const {
      targetMargin = 30,
      quantity = 1,
    } = options;

    // Calculate complexity multiplier
    const complexityMultiplier = this.calculateComplexityMultiplier(
      (service as any).complexityFactors || [],
      clientData
    );

    // Calculate volume discount
    const volumeDiscount = this.calculateVolumeDiscount(quantity);

    // Calculate geographic adjustment
    const geographicAdjustment = GEOGRAPHIC_MULTIPLIERS[clientData.region || ''] || 1;

    // Apply pricing rules
    const { adjustedPrice, adjustments } = await this.applyPricingRules(
      service.basePrice * complexityMultiplier,
      service.pricingRules,
      clientData
    );

    // Calculate costs and minimum price
    const costs = adjustedPrice * 0.6; // Assume 60% cost ratio
    const minimumPrice = costs / (1 - (targetMargin / 100));

    // Calculate final price
    const finalPrice = Math.max(
      minimumPrice,
      adjustedPrice * volumeDiscount * geographicAdjustment
    );

    // Calculate annual value based on frequency
    const annualValue = this.calculateAnnualValue(finalPrice, service.defaultFrequency);

    return {
      basePrice: service.basePrice,
      complexityMultiplier,
      volumeDiscount,
      geographicAdjustment,
      adjustments,
      finalPrice: Math.round(finalPrice * 100) / 100,
      annualValue: Math.round(annualValue * 100) / 100,
      margin: this.calculateMargin(finalPrice, costs),
      breakdown: {
        directCosts: Math.round(costs * 0.5 * 100) / 100,
        indirectCosts: Math.round(costs * 0.3 * 100) / 100,
        overheadAllocation: Math.round(costs * 0.2 * 100) / 100,
        targetMargin,
        minimumPrice: Math.round(minimumPrice * 100) / 100,
      },
    };
  }

  /**
   * Calculate price for multiple services
   */
  async calculateProposalPricing(
    services: Array<{
      serviceId: string;
      quantity: number;
      discountPercent?: number;
    }>,
    clientData: any,
    globalDiscount?: { type: 'PERCENTAGE' | 'FIXED'; value: number }
  ): Promise<{
    services: Array<PricingCalculation & { serviceId: string; quantity: number; discount: number }>;
    subtotal: number;
    globalDiscount: number;
    vatAmount: number;
    total: number;
  }> {
    const serviceCalculations = await Promise.all(
      services.map(async (svc) => {
        const calculation = await this.calculatePrice(svc.serviceId, clientData, {
          quantity: svc.quantity,
        });
        
        // Apply line item discount
        const lineDiscount = calculation.finalPrice * (svc.discountPercent || 0) / 100;
        
        return {
          ...calculation,
          serviceId: svc.serviceId,
          quantity: svc.quantity,
          discount: lineDiscount,
          finalPrice: calculation.finalPrice - lineDiscount,
        };
      })
    );

    const subtotal = serviceCalculations.reduce((sum, svc) => sum + svc.finalPrice, 0);
    
    // Apply global discount
    let globalDiscountAmount = 0;
    if (globalDiscount) {
      globalDiscountAmount = globalDiscount.type === 'PERCENTAGE'
        ? subtotal * (globalDiscount.value / 100)
        : globalDiscount.value;
    }

    const discountedSubtotal = subtotal - globalDiscountAmount;
    const vatAmount = Math.round(discountedSubtotal * 0.2 * 100) / 100; // 20% VAT
    const total = Math.round((discountedSubtotal + vatAmount) * 100) / 100;

    return {
      services: serviceCalculations,
      subtotal: Math.round(subtotal * 100) / 100,
      globalDiscount: Math.round(globalDiscountAmount * 100) / 100,
      vatAmount,
      total,
    };
  }

  /**
   * Calculate complexity multiplier based on client data
   */
  private calculateComplexityMultiplier(
    factors: ComplexityFactor[],
    clientData: any
  ): number {
    let multiplier = 1;

    // Apply transaction volume factor
    if (clientData.transactionVolume) {
      if (clientData.transactionVolume > 500) multiplier *= 1.3;
      else if (clientData.transactionVolume > 200) multiplier *= 1.15;
      else if (clientData.transactionVolume > 50) multiplier *= 1.05;
    }

    // Apply record quality factor
    if (clientData.recordQuality) {
      switch (clientData.recordQuality) {
        case 'POOR':
          multiplier *= 1.4;
          break;
        case 'AVERAGE':
          multiplier *= 1.1;
          break;
        case 'GOOD':
          multiplier *= 1.0;
          break;
      }
    }

    // Apply employee count factor
    if (clientData.employeeCount) {
      if (clientData.employeeCount > 50) multiplier *= 1.25;
      else if (clientData.employeeCount > 20) multiplier *= 1.15;
      else if (clientData.employeeCount > 5) multiplier *= 1.05;
    }

    return multiplier;
  }

  /**
   * Calculate volume discount
   */
  private calculateVolumeDiscount(quantity: number): number {
    if (quantity >= 20) return 0.85;
    if (quantity >= 10) return 0.90;
    if (quantity >= 5) return 0.95;
    return 1;
  }

  /**
   * Apply pricing rules
   */
  private async applyPricingRules(
    basePrice: number,
    rules: any[],
    clientData: any
  ): Promise<{ adjustedPrice: number; adjustments: PricingAdjustment[] }> {
    let adjustedPrice = basePrice;
    const adjustments: PricingAdjustment[] = [];

    for (const rule of rules) {
      if (this.evaluateCondition(rule.condition, clientData)) {
        const amount = rule.adjustmentType === 'PERCENTAGE'
          ? adjustedPrice * (rule.adjustmentValue / 100)
          : rule.adjustmentValue;

        adjustedPrice += amount;

        adjustments.push({
          ruleId: rule.id,
          name: rule.name,
          type: rule.adjustmentType,
          value: rule.adjustmentValue,
          amount: Math.round(amount * 100) / 100,
        });
      }
    }

    return { adjustedPrice, adjustments };
  }

  /**
   * Evaluate a pricing condition
   */
  private evaluateCondition(condition: any, clientData: any): boolean {
    const value = clientData[condition.field];
    const compareValue = condition.value;

    switch (condition.operator) {
      case 'EQ':
        return value === compareValue;
      case 'GT':
        return value > compareValue;
      case 'LT':
        return value < compareValue;
      case 'GTE':
        return value >= compareValue;
      case 'LTE':
        return value <= compareValue;
      case 'IN':
        return Array.isArray(compareValue) && compareValue.includes(value);
      default:
        return false;
    }
  }

  /**
   * Calculate annual value based on frequency
   */
  private calculateAnnualValue(price: number, frequency: string): number {
    switch (frequency) {
      case 'MONTHLY':
        return price * 12;
      case 'QUARTERLY':
        return price * 4;
      case 'ANNUALLY':
      case 'ONE_OFF':
        return price;
      default:
        return price;
    }
  }

  /**
   * Calculate margin percentage
   */
  private calculateMargin(revenue: number, costs: number): number {
    if (revenue === 0) return 0;
    return Math.round(((revenue - costs) / revenue) * 100 * 100) / 100;
  }
}

export default PricingEngine;
