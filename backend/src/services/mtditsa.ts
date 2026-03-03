import { MTDITSAStatus } from '@prisma/client';

// Income source types
interface IncomeSource {
  type: 'SELF_EMPLOYMENT' | 'PROPERTY' | 'PARTNERSHIP' | 'OTHER';
  amount: number;
}

// Quarterly deadline structure
interface QuarterlyDeadline {
  quarter: number;
  periodStart: Date;
  periodEnd: Date;
  filingDeadline: Date;
  paymentDeadline: Date;
}

// MTD ITSA assessment result
interface MTDITSAssessment {
  status: MTDITSAStatus;
  isRequired: boolean;
  effectiveDate: Date | null;
  incomeThreshold: number;
  triggeredBy: string[];
  exemptReason?: string;
  quarterlyDeadlines: QuarterlyDeadline[];
  recommendations: string[];
}

// Thresholds by tax year
const THRESHOLDS = {
  2026: 50000,
  2027: 30000,
  2028: 20000,
};

// Exempt categories
const EXEMPT_CATEGORIES = [
  'Trustees of registered pension schemes',
  'Non-resident companies',
  'Partnerships with turnover below £10,000',
  'Estate administrators',
  'Charities',
  'Members of Lloyd\'s of London',
];

export class MTDITSAService {
  /**
   * Calculate MTD ITSA status based on income and sources
   */
  static calculateStatus(
    annualIncome: number,
    incomeSources: IncomeSource[],
    options: {
      isTrustee?: boolean;
      isNonResident?: boolean;
      isCharity?: boolean;
      partnershipTurnover?: number;
    } = {}
  ): MTDITSAssessment {
    const triggeredBy: string[] = [];
    const recommendations: string[] = [];

    // Check exemptions first
    const exemption = this.checkExemptions(options, incomeSources);
    if (exemption.exempt) {
      return {
        status: MTDITSAStatus.EXEMPT,
        isRequired: false,
        effectiveDate: null,
        incomeThreshold: 0,
        triggeredBy: [],
        exemptReason: exemption.reason,
        quarterlyDeadlines: [],
        recommendations: ['No MTD ITSA action required'],
      };
    }

    // Check income threshold
    if (annualIncome >= THRESHOLDS[2026]) {
      triggeredBy.push(`Income of £${annualIncome.toLocaleString()} exceeds £50,000 threshold`);
      
      return {
        status: MTDITSAStatus.REQUIRED_2026,
        isRequired: true,
        effectiveDate: new Date('2026-04-06'),
        incomeThreshold: THRESHOLDS[2026],
        triggeredBy,
        quarterlyDeadlines: this.calculateQuarterlyDeadlines(2026),
        recommendations: [
          'Register for MTD ITSA immediately',
          'Select compatible accounting software',
          'Set up quarterly reporting processes',
          'Inform client of new obligations',
        ],
      };
    }

    if (annualIncome >= THRESHOLDS[2027]) {
      triggeredBy.push(`Income of £${annualIncome.toLocaleString()} exceeds £30,000 threshold`);
      
      return {
        status: MTDITSAStatus.REQUIRED_2027,
        isRequired: true,
        effectiveDate: new Date('2027-04-06'),
        incomeThreshold: THRESHOLDS[2027],
        triggeredBy,
        quarterlyDeadlines: this.calculateQuarterlyDeadlines(2027),
        recommendations: [
          'Plan MTD ITSA transition for 2027',
          'Evaluate accounting software options',
          'Begin client education on quarterly reporting',
        ],
      };
    }

    if (annualIncome >= THRESHOLDS[2028]) {
      triggeredBy.push(`Income of £${annualIncome.toLocaleString()} exceeds £20,000 threshold`);
      
      return {
        status: MTDITSAStatus.REQUIRED_2028,
        isRequired: true,
        effectiveDate: new Date('2028-04-06'),
        incomeThreshold: THRESHOLDS[2028],
        triggeredBy,
        quarterlyDeadlines: this.calculateQuarterlyDeadlines(2028),
        recommendations: [
          'Monitor for updates to MTD ITSA requirements',
          'Plan early transition if beneficial',
        ],
      };
    }

    // Below all thresholds
    recommendations.push('No immediate MTD ITSA requirements');
    recommendations.push('Monitor income for threshold changes');

    return {
      status: MTDITSAStatus.NOT_REQUIRED,
      isRequired: false,
      effectiveDate: null,
      incomeThreshold: 0,
      triggeredBy: [],
      quarterlyDeadlines: [],
      recommendations,
    };
  }

  /**
   * Check for exemptions
   */
  private static checkExemptions(
    options: {
      isTrustee?: boolean;
      isNonResident?: boolean;
      isCharity?: boolean;
      partnershipTurnover?: number;
    },
    incomeSources: IncomeSource[]
  ): { exempt: boolean; reason?: string } {
    if (options.isTrustee) {
      return { exempt: true, reason: 'Trustee of registered pension scheme' };
    }

    if (options.isNonResident) {
      return { exempt: true, reason: 'Non-resident company' };
    }

    if (options.isCharity) {
      return { exempt: true, reason: 'Charitable organization' };
    }

    // Check for small partnership
    const partnershipIncome = incomeSources.find(s => s.type === 'PARTNERSHIP');
    if (partnershipIncome && options.partnershipTurnover && options.partnershipTurnover < 10000) {
      return { exempt: true, reason: 'Partnership with turnover below £10,000' };
    }

    return { exempt: false };
  }

  /**
   * Calculate quarterly deadlines for a tax year
   */
  static calculateQuarterlyDeadlines(taxYear: number): QuarterlyDeadline[] {
    // Tax year runs from April 6 to April 5
    const year = taxYear;
    
    return [
      {
        quarter: 1,
        periodStart: new Date(`${year}-04-06`),
        periodEnd: new Date(`${year}-07-05`),
        filingDeadline: new Date(`${year}-08-05`),
        paymentDeadline: new Date(`${year + 1}-01-31`),
      },
      {
        quarter: 2,
        periodStart: new Date(`${year}-07-06`),
        periodEnd: new Date(`${year}-10-05`),
        filingDeadline: new Date(`${year}-11-05`),
        paymentDeadline: new Date(`${year + 1}-01-31`),
      },
      {
        quarter: 3,
        periodStart: new Date(`${year}-10-06`),
        periodEnd: new Date(`${year + 1}-01-05`),
        filingDeadline: new Date(`${year + 1}-02-05`),
        paymentDeadline: new Date(`${year + 1}-01-31`),
      },
      {
        quarter: 4,
        periodStart: new Date(`${year + 1}-01-06`),
        periodEnd: new Date(`${year + 1}-04-05`),
        filingDeadline: new Date(`${year + 1}-05-05`),
        paymentDeadline: new Date(`${year + 1}-01-31`),
      },
    ];
  }

  /**
   * Get plain language explanation of MTD ITSA obligations
   */
  static getObligationExplanation(status: MTDITSAStatus): string {
    const explanations: Record<MTDITSAStatus, string> = {
      [MTDITSAStatus.NOT_REQUIRED]: 
        'Making Tax Digital for Income Tax Self Assessment (MTD ITSA) is not currently required. ' +
        'You should continue submitting your Self Assessment tax return annually.',
      
      [MTDITSAStatus.REQUIRED_2026]:
        'You must comply with MTD ITSA from April 2026. This means submitting quarterly updates ' +
        'of your income and expenses digitally using compatible software.',
      
      [MTDITSAStatus.REQUIRED_2027]:
        'You must comply with MTD ITSA from April 2027. This means submitting quarterly updates ' +
        'of your income and expenses digitally using compatible software.',
      
      [MTDITSAStatus.REQUIRED_2028]:
        'You must comply with MTD ITSA from April 2028. This means submitting quarterly updates ' +
        'of your income and expenses digitally using compatible software.',
      
      [MTDITSAStatus.EXEMPT]:
        'You are exempt from MTD ITSA requirements based on your circumstances. ' +
        'Continue with your current filing arrangements.',
    };

    return explanations[status] || explanations[MTDITSAStatus.NOT_REQUIRED];
  }

  /**
   * Get compatible software recommendations
   */
  static getSoftwareRecommendations(): Array<{
    name: string;
    category: string;
    features: string[];
    priceRange: string;
  }> {
    return [
      {
        name: 'Xero',
        category: 'Full-featured',
        features: ['Bank feeds', 'Invoicing', 'Expense tracking', 'MTD VAT', 'MTD ITSA ready'],
        priceRange: '£15-30/month',
      },
      {
        name: 'QuickBooks Online',
        category: 'Full-featured',
        features: ['Bank feeds', 'Invoicing', 'Receipt capture', 'MTD VAT', 'MTD ITSA ready'],
        priceRange: '£15-40/month',
      },
      {
        name: 'FreeAgent',
        category: 'SME-focused',
        features: ['Bank feeds', 'Invoicing', 'Self Assessment', 'MTD VAT', 'MTD ITSA ready'],
        priceRange: '£10-20/month',
      },
      {
        name: 'Sage Business Cloud',
        category: 'Enterprise',
        features: ['Bank feeds', 'Invoicing', 'Inventory', 'MTD VAT', 'MTD ITSA ready'],
        priceRange: '£15-40/month',
      },
    ];
  }

  /**
   * Generate MTD ITSA service recommendations based on client profile
   */
  static generateServiceRecommendations(assessment: MTDITSAssessment): string[] {
    const services: string[] = [];

    if (assessment.status === MTDITSAStatus.REQUIRED_2026) {
      services.push('MTD ITSA Transition Support - Urgent');
      services.push('Quarterly Bookkeeping & Reporting');
      services.push('Digital Record Keeping Setup');
      services.push('Software Selection & Training');
    } else if (assessment.status === MTDITSAStatus.REQUIRED_2027) {
      services.push('MTD ITSA Transition Planning');
      services.push('Quarterly Bookkeeping');
      services.push('Software Evaluation');
    } else if (assessment.status === MTDITSAStatus.REQUIRED_2028) {
      services.push('MTD ITSA Readiness Review');
      services.push('Digital Records Preparation');
    }

    return services;
  }
}

export default MTDITSAService;
