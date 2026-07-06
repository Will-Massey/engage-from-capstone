'use strict';
// Shared types and utilities for Engage by Capstone
Object.defineProperty(exports, '__esModule', { value: true });
exports.mtditsaCalculator =
  exports.calculatePrice =
  exports.validateCompanyNumber =
  exports.validateUTR =
  exports.validateUKPostcode =
  exports.calculateMargin =
  exports.calculateVAT =
  exports.generateReference =
  exports.formatDate =
  exports.formatCurrency =
  exports.ProfessionalBody =
  exports.PricingFrequency =
  exports.MTDITSAStatus =
  exports.ProposalStatus =
  exports.ServiceCategory =
  exports.CompanyType =
  exports.UserRole =
    void 0;
// ==================== ENUMS ====================
var UserRole;
(function (UserRole) {
  UserRole['PARTNER'] = 'PARTNER';
  UserRole['MD'] = 'MD';
  UserRole['MANAGER'] = 'MANAGER';
  UserRole['SENIOR'] = 'SENIOR';
  UserRole['JUNIOR'] = 'JUNIOR';
  UserRole['CLIENT'] = 'CLIENT';
})(UserRole || (exports.UserRole = UserRole = {}));
var CompanyType;
(function (CompanyType) {
  CompanyType['LIMITED_COMPANY'] = 'LIMITED_COMPANY';
  CompanyType['SOLE_TRADER'] = 'SOLE_TRADER';
  CompanyType['PARTNERSHIP'] = 'PARTNERSHIP';
  CompanyType['LLP'] = 'LLP';
  CompanyType['CHARITY'] = 'CHARITY';
  CompanyType['PROPERTY_INVESTMENT'] = 'PROPERTY_INVESTMENT';
})(CompanyType || (exports.CompanyType = CompanyType = {}));
var ServiceCategory;
(function (ServiceCategory) {
  ServiceCategory['COMPLIANCE'] = 'COMPLIANCE';
  ServiceCategory['ADVISORY'] = 'ADVISORY';
  ServiceCategory['TECHNICAL'] = 'TECHNICAL';
  ServiceCategory['SPECIALIZED'] = 'SPECIALIZED';
})(ServiceCategory || (exports.ServiceCategory = ServiceCategory = {}));
var ProposalStatus;
(function (ProposalStatus) {
  ProposalStatus['DRAFT'] = 'DRAFT';
  ProposalStatus['PENDING'] = 'PENDING';
  ProposalStatus['SENT'] = 'SENT';
  ProposalStatus['VIEWED'] = 'VIEWED';
  ProposalStatus['ACCEPTED'] = 'ACCEPTED';
  ProposalStatus['DECLINED'] = 'DECLINED';
  ProposalStatus['EXPIRED'] = 'EXPIRED';
  ProposalStatus['WITHDRAWN'] = 'WITHDRAWN';
  ProposalStatus['ARCHIVED'] = 'ARCHIVED';
  ProposalStatus['LOST'] = 'LOST';
})(ProposalStatus || (exports.ProposalStatus = ProposalStatus = {}));
var MTDITSAStatus;
(function (MTDITSAStatus) {
  MTDITSAStatus['NOT_REQUIRED'] = 'NOT_REQUIRED';
  MTDITSAStatus['REQUIRED_2026'] = 'REQUIRED_2026';
  MTDITSAStatus['REQUIRED_2027'] = 'REQUIRED_2027';
  MTDITSAStatus['REQUIRED_2028'] = 'REQUIRED_2028';
  MTDITSAStatus['EXEMPT'] = 'EXEMPT';
})(MTDITSAStatus || (exports.MTDITSAStatus = MTDITSAStatus = {}));
var PricingFrequency;
(function (PricingFrequency) {
  PricingFrequency['MONTHLY'] = 'MONTHLY';
  PricingFrequency['QUARTERLY'] = 'QUARTERLY';
  PricingFrequency['ANNUALLY'] = 'ANNUALLY';
  PricingFrequency['ONE_OFF'] = 'ONE_OFF';
})(PricingFrequency || (exports.PricingFrequency = PricingFrequency = {}));
var ProfessionalBody;
(function (ProfessionalBody) {
  ProfessionalBody['ACCA'] = 'ACCA';
  ProfessionalBody['ICAEW'] = 'ICAEW';
  ProfessionalBody['AAT'] = 'AAT';
  ProfessionalBody['CIMA'] = 'CIMA';
  ProfessionalBody['ICAS'] = 'ICAS';
  ProfessionalBody['CTA'] = 'CTA';
  ProfessionalBody['CPAA'] = 'CPAA';
})(ProfessionalBody || (exports.ProfessionalBody = ProfessionalBody = {}));
// ==================== UTILITY FUNCTIONS ====================
const formatCurrency = (amount, currency = 'GBP') => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};
exports.formatCurrency = formatCurrency;
const formatDate = (date, format = 'short') => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (format === 'short') {
    return d.toLocaleDateString('en-GB');
  }
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
exports.formatDate = formatDate;
const generateReference = (prefix = 'PROP') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};
exports.generateReference = generateReference;
const calculateVAT = (amount, vatRate = 20) => {
  return Math.round(amount * (vatRate / 100) * 100) / 100;
};
exports.calculateVAT = calculateVAT;
const calculateMargin = (revenue, costs) => {
  if (revenue === 0) return 0;
  return ((revenue - costs) / revenue) * 100;
};
exports.calculateMargin = calculateMargin;
// ==================== VALIDATION ====================
const validateUKPostcode = (postcode) => {
  const postcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;
  return postcodeRegex.test(postcode);
};
exports.validateUKPostcode = validateUKPostcode;
const validateUTR = (utr) => {
  const utrRegex = /^\d{10}$/;
  return utrRegex.test(utr);
};
exports.validateUTR = validateUTR;
const validateCompanyNumber = (number) => {
  const companyNumberRegex = /^[A-Za-z0-9]{6,8}$/;
  return companyNumberRegex.test(number);
};
exports.validateCompanyNumber = validateCompanyNumber;
const calculatePrice = (basePrice, complexityFactors, volume, region, targetMargin = 30) => {
  const complexityMultiplier = complexityFactors.reduce((acc, f) => acc * f, 1);
  const volumeDiscount = volume > 10 ? 0.9 : volume > 5 ? 0.95 : 1;
  const geographicMultipliers = {
    LONDON: 1.25,
    SOUTH_EAST: 1.15,
    SOUTH_WEST: 1.05,
    EAST: 1.1,
    WEST_MIDLANDS: 0.95,
    EAST_MIDLANDS: 0.9,
    YORKSHIRE: 0.9,
    NORTH_WEST: 0.95,
    NORTH_EAST: 0.85,
    WALES: 0.9,
    SCOTLAND: 0.95,
    NORTHERN_IRELAND: 0.85,
  };
  const geographicAdjustment = geographicMultipliers[region] || 1;
  const adjustedBase = basePrice * complexityMultiplier;
  const costs = adjustedBase * 0.6;
  const minimumPrice = costs / (1 - targetMargin / 100);
  const finalPrice = Math.max(minimumPrice, adjustedBase * volumeDiscount * geographicAdjustment);
  return {
    basePrice,
    complexityMultiplier,
    volumeDiscount,
    geographicAdjustment,
    finalPrice: Math.round(finalPrice * 100) / 100,
    margin: (0, exports.calculateMargin)(finalPrice, costs),
    breakdown: {
      directCosts: Math.round(costs * 0.5 * 100) / 100,
      indirectCosts: Math.round(costs * 0.3 * 100) / 100,
      overheadAllocation: Math.round(costs * 0.2 * 100) / 100,
      targetMargin,
      minimumPrice: Math.round(minimumPrice * 100) / 100,
    },
  };
};
exports.calculatePrice = calculatePrice;
// MTD ITSA Calculator
exports.mtditsaCalculator = {
  calculateStatus: (annualIncome, incomeSources) => {
    const hasExemptSource = incomeSources.some(
      (source) => source.type === 'PARTNERSHIP' && source.amount < 10000
    );
    if (hasExemptSource) {
      return MTDITSAStatus.EXEMPT;
    }
    if (annualIncome >= 50000) {
      return MTDITSAStatus.REQUIRED_2026;
    } else if (annualIncome >= 30000) {
      return MTDITSAStatus.REQUIRED_2027;
    } else if (annualIncome >= 20000) {
      return MTDITSAStatus.REQUIRED_2028;
    }
    return MTDITSAStatus.NOT_REQUIRED;
  },
  calculateQuarterlyDeadlines: (taxYear) => {
    const year = taxYear;
    return [
      {
        quarter: 1,
        periodStart: new Date(`${year}-04-06`),
        periodEnd: new Date(`${year}-07-05`),
        filingDeadline: new Date(`${year}-08-05`),
        paymentDeadline: new Date(`${year}-01-31`),
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
  },
  getEligibilityCriteria: () => ({
    threshold2026: 50000,
    threshold2027: 30000,
    threshold2028: 20000,
    exemptCategories: [
      'Trustees of registered pension schemes',
      'Non-resident companies',
      'Partnerships with turnover below £10,000',
      'Estate administrators',
    ],
  }),
};
//# sourceMappingURL=index.js.map
