/**
 * Comprehensive UK Accountancy Services Catalog
 * Based on typical services offered by UK accounting practices
 * All pricing is indicative and should be customised per practice
 */

export const billingCycles = [
  { value: 'MONTHLY', label: 'Monthly', description: 'Split annual cost over 12 equal payments' },
  { value: 'QUARTERLY', label: 'Quarterly', description: '4 payments per year' },
  { value: 'ANNUALLY', label: 'Annually', description: 'Single annual payment' },
  { value: 'WEEKLY', label: 'Weekly', description: '52 weekly payments' },
  { value: 'FIXED_DATE', label: 'Fixed Date', description: 'Bill on specific date(s)' },
] as const;

export const vatRates = [
  { value: 'STANDARD_20', label: 'Standard Rate (20%)', rate: 20 },
  { value: 'REDUCED_5', label: 'Reduced Rate (5%)', rate: 5 },
  { value: 'ZERO', label: 'Zero Rated (0%)', rate: 0 },
  { value: 'EXEMPT', label: 'VAT Exempt', rate: 0 },
] as const;

export interface ServiceTemplate {
  category: string;
  subcategory?: string;
  name: string;
  description: string;
  longDescription?: string;
  basePrice: number;
  baseHours: number;
  pricingModel: 'FIXED' | 'HOURLY' | 'TIERED';
  billingCycle: 'FIXED_DATE' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  isVatApplicable: boolean;
  vatRate: 'STANDARD_20' | 'REDUCED_5' | 'ZERO' | 'EXEMPT';
  annualEquivalent?: number;
  frequencyOptions: string[];
  defaultFrequency: string;
  applicableEntityTypes: string[];
  complexityFactors: ComplexityFactor[];
  requirements: string[];
  deliverables: string[];
  regulatoryNotes?: string;
  tags: string[];
  isPopular: boolean;
}

export interface ComplexityFactor {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'in' | 'contains';
  value: any;
  adjustmentType: 'PERCENTAGE' | 'FIXED' | 'MULTIPLIER';
  adjustmentValue: number;
  description: string;
}

// ==================== COMPLIANCE SERVICES ====================

export const complianceServices: ServiceTemplate[] = [
  // Annual Accounts
  {
    category: 'COMPLIANCE',
    subcategory: 'Annual Accounts',
    name: 'Statutory Annual Accounts',
    description: 'Preparation and filing of statutory annual accounts with Companies House',
    longDescription: 'Complete preparation of statutory annual accounts in accordance with Companies Act 2006 and FRS 102. Includes reconciliation, adjustments, director\'s report preparation, and electronic filing with Companies House.',
    basePrice: 750,
    baseHours: 5,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY', 'MONTHLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'LLP'],
    complexityFactors: [
      { field: 'turnover', operator: 'gt', value: 1000000, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'High turnover complexity' },
      { field: 'transactionCount', operator: 'gt', value: 500, adjustmentType: 'PERCENTAGE', adjustmentValue: 20, description: 'High transaction volume' },
      { field: 'hasForeignTransactions', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 15, description: 'Foreign transactions' },
    ],
    requirements: ['Bank statements for the year', 'Sales and purchase invoices', 'Payroll records', 'VAT returns', 'Previous year accounts'],
    deliverables: ['Statutory annual accounts', 'Director\'s report', 'Filed confirmation from Companies House'],
    regulatoryNotes: 'Must be filed within 9 months of the accounting reference date',
    tags: ['compliance', 'accounts', 'companies house'],
    isPopular: true,
  },
  {
    category: 'COMPLIANCE',
    subcategory: 'Annual Accounts',
    name: 'Sole Trader Annual Accounts',
    description: 'Preparation of annual accounts for self-assessment purposes',
    longDescription: 'Preparation of annual accounts and income/expenditure statement for sole traders. Supports self-assessment tax return completion.',
    basePrice: 450,
    baseHours: 3,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY', 'MONTHLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['SOLE_TRADER'],
    complexityFactors: [
      { field: 'turnover', operator: 'gt', value: 85000, adjustmentType: 'PERCENTAGE', adjustmentValue: 15, description: 'VAT threshold complexity' },
      { field: 'hasMultipleIncomeSources', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 20, description: 'Multiple income streams' },
    ],
    requirements: ['Bank statements', 'Income records', 'Expense receipts', 'Vehicle mileage logs'],
    deliverables: ['Annual accounts summary', 'Tax calculation summary'],
    regulatoryNotes: 'Required for self-assessment tax return',
    tags: ['compliance', 'accounts', 'sole trader'],
    isPopular: true,
  },
  // Corporation Tax
  {
    category: 'COMPLIANCE',
    subcategory: 'Corporation Tax',
    name: 'CT600 Corporation Tax Return',
    description: 'Preparation and submission of Corporation Tax return to HMRC',
    longDescription: 'Complete CT600 Corporation Tax return preparation including tax computations, capital allowances claims, and iXBRL tagging. Electronic filing with HMRC.',
    basePrice: 600,
    baseHours: 4,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY', 'QUARTERLY', 'MONTHLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['LIMITED_COMPANY'],
    complexityFactors: [
      { field: 'hasRAndD', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 50, description: 'R&D tax relief claim' },
      { field: 'hasGroupRelief', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Group relief considerations' },
      { field: 'hasCapitalGains', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 20, description: 'Chargeable gains calculations' },
    ],
    requirements: ['Annual accounts', 'Prior year tax computations', 'Asset additions/disposals', 'R&D expenditure details if applicable'],
    deliverables: ['CT600 tax return', 'Tax computation', 'HMRC submission receipt'],
    regulatoryNotes: 'Must be filed within 12 months of the accounting period end',
    tags: ['compliance', 'corporation tax', 'ct600'],
    isPopular: true,
  },
  // Self Assessment
  {
    category: 'COMPLIANCE',
    subcategory: 'Self Assessment',
    name: 'Personal Tax Return (SA100)',
    description: 'Self-assessment tax return for individuals',
    longDescription: 'Complete self-assessment tax return preparation including employment income, self-employment, property income, investments, and capital gains.',
    basePrice: 350,
    baseHours: 2.5,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['SOLE_TRADER', 'LIMITED_COMPANY', 'PARTNERSHIP'],
    complexityFactors: [
      { field: 'hasPropertyIncome', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'Property income reporting' },
      { field: 'hasCapitalGains', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 40, description: 'Capital gains calculations' },
      { field: 'hasForeignIncome', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Foreign income reporting' },
      { field: 'isHigherRateTaxpayer', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 15, description: 'High income complexity' },
    ],
    requirements: ['P60/P45', 'Self-employment records', 'Bank interest statements', 'Dividend vouchers', 'Property income/expenses'],
    deliverables: ['Completed SA100', 'Tax calculation', 'Payment on account advice'],
    regulatoryNotes: 'Deadline: 31st January following tax year end',
    tags: ['compliance', 'self assessment', 'sa100'],
    isPopular: true,
  },
  // VAT
  {
    category: 'COMPLIANCE',
    subcategory: 'VAT',
    name: 'VAT Return Preparation',
    description: 'Quarterly VAT return preparation and submission',
    longDescription: 'Complete VAT return preparation including reconciliations, partial exemption calculations, and Making Tax Digital (MTD) compliant submission.',
    basePrice: 200,
    baseHours: 1.5,
    pricingModel: 'FIXED',
    billingCycle: 'QUARTERLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['QUARTERLY', 'MONTHLY', 'ANNUALLY'],
    defaultFrequency: 'QUARTERLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
    complexityFactors: [
      { field: 'isPartialExemption', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 50, description: 'Partial exemption calculations' },
      { field: 'hasECSales', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'EC Sales List reporting' },
      { field: 'usesCashAccounting', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 10, description: 'Cash accounting scheme' },
      { field: 'usesFlatRate', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: -15, description: 'Flat rate scheme discount' },
    ],
    requirements: ['Sales invoices', 'Purchase invoices', 'Bank statements', 'Previous VAT return'],
    deliverables: ['VAT return calculation', 'MTD submission', 'Payment advice'],
    regulatoryNotes: 'MTD compliant submission required',
    tags: ['compliance', 'vat', 'mtd'],
    isPopular: true,
  },
  {
    category: 'COMPLIANCE',
    subcategory: 'VAT',
    name: 'VAT Registration Service',
    description: 'VAT registration with HMRC',
    longDescription: 'Complete VAT registration service including eligibility assessment, scheme selection advice, and HMRC registration.',
    basePrice: 250,
    baseHours: 2,
    pricingModel: 'FIXED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
    complexityFactors: [
      { field: 'isGroupRegistration', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 100, description: 'Group VAT registration' },
    ],
    requirements: ['Business details', 'Turnover projections', 'Bank details'],
    deliverables: ['VAT registration number', 'Registration certificate', 'Scheme advice document'],
    regulatoryNotes: 'Voluntary registration available below threshold',
    tags: ['compliance', 'vat', 'registration'],
    isPopular: false,
  },
  // Payroll
  {
    category: 'COMPLIANCE',
    subcategory: 'Payroll',
    name: 'Monthly Payroll Processing',
    description: 'Full monthly payroll processing and RTI submissions',
    longDescription: 'Complete payroll service including payslip generation, RTI submissions to HMRC, auto-enrolment compliance, and year-end P60s.',
    basePrice: 25,
    baseHours: 0.5,
    pricingModel: 'FIXED',
    billingCycle: 'MONTHLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    annualEquivalent: 300,
    frequencyOptions: ['MONTHLY', 'WEEKLY'],
    defaultFrequency: 'MONTHLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
    complexityFactors: [
      { field: 'employeeCount', operator: 'gt', value: 1, adjustmentType: 'FIXED', adjustmentValue: 8, description: 'Per additional employee' },
      { field: 'hasDirectors', operator: 'eq', value: true, adjustmentType: 'FIXED', adjustmentValue: 15, description: 'Director remuneration' },
      { field: 'hasBenefits', operator: 'eq', value: true, adjustmentType: 'FIXED', adjustmentValue: 25, description: 'Benefits in kind (P11D)' },
    ],
    requirements: ['Employee details', 'Hours worked', 'Salary changes', 'New starters/leaver info'],
    deliverables: ['Payslips', 'RTI submissions', 'Payment summaries', 'Auto-enrolment reports'],
    regulatoryNotes: 'RTI submissions must be made on or before payday',
    tags: ['compliance', 'payroll', 'rti'],
    isPopular: true,
  },
  {
    category: 'COMPLIANCE',
    subcategory: 'Payroll',
    name: 'P11D Benefits Reporting',
    description: 'Annual P11D benefits in kind reporting',
    longDescription: 'Preparation and submission of P11D forms for benefits in kind and P11D(b) for Class 1A NIC.',
    basePrice: 350,
    baseHours: 3,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['LIMITED_COMPANY'],
    complexityFactors: [
      { field: 'benefitsCount', operator: 'gt', value: 5, adjustmentType: 'FIXED', adjustmentValue: 50, description: 'Per additional 5 benefits' },
      { field: 'hasCompanyCars', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Company car calculations' },
    ],
    requirements: ['Benefits details', 'Company car info', 'Employee loans', 'Medical insurance details'],
    deliverables: ['P11D forms', 'P11D(b)', 'Employee benefit statements'],
    regulatoryNotes: 'Deadline: 6th July following tax year end',
    tags: ['compliance', 'payroll', 'p11d', 'benefits'],
    isPopular: false,
  },
  // CIS
  {
    category: 'COMPLIANCE',
    subcategory: 'CIS',
    name: 'CIS Monthly Return',
    description: 'Construction Industry Scheme monthly return',
    longDescription: 'Monthly CIS return preparation and submission including verification of subcontractors and deductions reporting.',
    basePrice: 150,
    baseHours: 1.5,
    pricingModel: 'FIXED',
    billingCycle: 'MONTHLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    annualEquivalent: 1800,
    frequencyOptions: ['MONTHLY'],
    defaultFrequency: 'MONTHLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER'],
    complexityFactors: [
      { field: 'subcontractorCount', operator: 'gt', value: 5, adjustmentType: 'FIXED', adjustmentValue: 25, description: 'Per additional 5 subcontractors' },
    ],
    requirements: ['Subcontractor details', 'Payment records', 'Deduction statements', 'UTR numbers'],
    deliverables: ['CIS300 return', 'Subcontractor statements', 'Deduction certificates'],
    regulatoryNotes: 'Monthly filing required by 19th of following month',
    tags: ['compliance', 'cis', 'construction'],
    isPopular: false,
  },
  // Confirmation Statement
  {
    category: 'COMPLIANCE',
    subcategory: 'Confirmation Statement',
    name: 'Confirmation Statement (CS01)',
    description: 'Annual confirmation statement filing with Companies House',
    longDescription: 'Preparation and filing of annual confirmation statement including shareholder details, SIC codes, and registered office verification.',
    basePrice: 150,
    baseHours: 1,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['LIMITED_COMPANY'],
    complexityFactors: [
      { field: 'shareholderChanges', operator: 'eq', value: true, adjustmentType: 'FIXED', adjustmentValue: 50, description: 'Shareholder changes' },
    ],
    requirements: ['Current company details', 'Shareholder register', 'PSC register'],
    deliverables: ['Filed confirmation statement', 'Companies House receipt'],
    regulatoryNotes: 'Due annually within 14 days of the review period date',
    tags: ['compliance', 'confirmation statement', 'cs01'],
    isPopular: true,
  },
];

// ==================== ADVISORY SERVICES ====================

export const advisoryServices: ServiceTemplate[] = [
  {
    category: 'ADVISORY',
    subcategory: 'Business Planning',
    name: 'Business Structure Review',
    description: 'Review and advice on optimal business structure',
    longDescription: 'Comprehensive review of business structure (sole trader vs limited company vs partnership) with tax efficiency recommendations.',
    basePrice: 750,
    baseHours: 5,
    pricingModel: 'FIXED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['SOLE_TRADER', 'PARTNERSHIP'],
    complexityFactors: [
      { field: 'hasMultipleBusinesses', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 40, description: 'Multiple business structures' },
    ],
    requirements: ['Current financials', 'Future projections', 'Business plans'],
    deliverables: ['Structure comparison report', 'Tax savings analysis', 'Implementation roadmap'],
    regulatoryNotes: 'Should be reviewed annually or when circumstances change',
    tags: ['advisory', 'structure', 'planning'],
    isPopular: true,
  },
  {
    category: 'ADVISORY',
    subcategory: 'Tax Planning',
    name: 'Personal Tax Planning Review',
    description: 'Annual personal tax planning and efficiency review',
    longDescription: 'Comprehensive review of personal tax position including income splitting, pension contributions, ISA allowances, and capital gains planning.',
    basePrice: 600,
    baseHours: 4,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP'],
    complexityFactors: [
      { field: 'incomeLevel', operator: 'gt', value: 100000, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'High income complexity' },
      { field: 'hasMultipleIncomeSources', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Multiple income streams' },
    ],
    requirements: ['Current tax returns', 'Investment details', 'Pension information'],
    deliverables: ['Tax planning report', 'Recommendations summary', 'Action plan'],
    regulatoryNotes: 'Tax year end planning recommended',
    tags: ['advisory', 'tax planning', 'efficiency'],
    isPopular: true,
  },
  {
    category: 'ADVISORY',
    subcategory: 'R&D Tax',
    name: 'R&D Tax Credit Claim',
    description: 'Research and Development tax relief claim preparation',
    longDescription: 'Complete R&D tax credit claim preparation including technical narrative, cost analysis, and HMRC submission.',
    basePrice: 2500,
    baseHours: 15,
    pricingModel: 'TIERED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['LIMITED_COMPANY'],
    complexityFactors: [
      { field: 'rdExpenditure', operator: 'gt', value: 500000, adjustmentType: 'PERCENTAGE', adjustmentValue: 20, description: 'Large R&D spend' },
      { field: 'hasMultipleProjects', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Multiple R&D projects' },
    ],
    requirements: ['Project descriptions', 'Staff costs', 'Consumables', 'Subcontractor invoices', 'Technical specifications'],
    deliverables: ['R&D claim report', 'Technical narrative', 'CT600 amendment', 'HMRC correspondence'],
    regulatoryNotes: 'SME scheme or RDEC scheme depending on company size',
    tags: ['advisory', 'r&d', 'tax relief'],
    isPopular: false,
  },
  {
    category: 'ADVISORY',
    subcategory: 'Business Growth',
    name: 'Management Accounts',
    description: 'Monthly or quarterly management accounts',
    longDescription: 'Regular management accounts preparation including P&L, balance sheet, cash flow, and KPI reporting with commentary.',
    basePrice: 450,
    baseHours: 3,
    pricingModel: 'FIXED',
    billingCycle: 'QUARTERLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    annualEquivalent: 1800,
    frequencyOptions: ['MONTHLY', 'QUARTERLY'],
    defaultFrequency: 'QUARTERLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'LLP'],
    complexityFactors: [
      { field: 'turnover', operator: 'gt', value: 2000000, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'High turnover' },
      { field: 'requiresConsolidation', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 50, description: 'Group consolidation' },
    ],
    requirements: ['Bank statements', 'Invoices', 'Payroll info', 'Expense claims'],
    deliverables: ['Management accounts pack', 'Variance analysis', 'KPI dashboard'],
    regulatoryNotes: 'Best practice for growing businesses',
    tags: ['advisory', 'management accounts', 'reporting'],
    isPopular: true,
  },
  {
    category: 'ADVISORY',
    subcategory: 'Cash Flow',
    name: 'Cash Flow Forecasting',
    description: '13-week rolling cash flow forecast',
    longDescription: 'Detailed cash flow forecasting with scenario planning and working capital optimisation recommendations.',
    basePrice: 550,
    baseHours: 4,
    pricingModel: 'FIXED',
    billingCycle: 'MONTHLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    annualEquivalent: 6600,
    frequencyOptions: ['MONTHLY', 'QUARTERLY'],
    defaultFrequency: 'MONTHLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'LLP'],
    complexityFactors: [
      { field: 'hasMultipleCurrencies', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'Multi-currency operations' },
    ],
    requirements: ['Historical cash flows', 'Sales pipeline', 'Payment terms', 'Committed expenditure'],
    deliverables: ['13-week forecast', 'Scenario analysis', 'Working capital report'],
    regulatoryNotes: 'Essential for funding applications',
    tags: ['advisory', 'cash flow', 'forecasting'],
    isPopular: true,
  },
  {
    category: 'ADVISORY',
    subcategory: 'Funding',
    name: 'Funding Application Support',
    description: 'Support with business loan or grant applications',
    longDescription: 'Comprehensive support for funding applications including financial projections, business plans, and lender negotiations.',
    basePrice: 1500,
    baseHours: 12,
    pricingModel: 'FIXED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['LIMITED_COMPANY', 'LLP', 'PARTNERSHIP'],
    complexityFactors: [
      { field: 'fundingAmount', operator: 'gt', value: 500000, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Large funding requirement' },
      { field: 'isComplexStructure', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 40, description: 'Complex group structure' },
    ],
    requirements: ['Business plan', 'Financial history', 'Funding requirement details', 'Security details'],
    deliverables: ['Financial projections', 'Supporting documents', 'Lender presentations'],
    regulatoryNotes: 'Success fee may apply',
    tags: ['advisory', 'funding', 'loans'],
    isPopular: false,
  },
];

// ==================== MTD ITSA SERVICES ====================

export const mtditsaServices: ServiceTemplate[] = [
  {
    category: 'MTD_ITSA',
    subcategory: 'Quarterly Returns',
    name: 'MTD ITSA Quarterly Return',
    description: 'Making Tax Digital quarterly income tax return',
    longDescription: 'Quarterly income and expenditure submission under Making Tax Digital for Income Tax Self Assessment (MTD ITSA).',
    basePrice: 75,
    baseHours: 0.75,
    pricingModel: 'FIXED',
    billingCycle: 'QUARTERLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['QUARTERLY'],
    defaultFrequency: 'QUARTERLY',
    applicableEntityTypes: ['SOLE_TRADER', 'LANDLORD'],
    complexityFactors: [
      { field: 'propertyCount', operator: 'gt', value: 3, adjustmentType: 'FIXED', adjustmentValue: 40, description: 'Multiple properties' },
      { field: 'hasAllowableExpenses', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 20, description: 'Complex expenses' },
    ],
    requirements: ['Quarterly income records', 'Expense receipts', 'Mileage logs'],
    deliverables: ['Quarterly submission', 'Tax estimate', 'Payment on account advice'],
    regulatoryNotes: 'Mandatory from April 2026 for income over £50,000',
    tags: ['mtd itsa', 'quarterly', 'compliance'],
    isPopular: true,
  },
  {
    category: 'MTD_ITSA',
    subcategory: 'Digital Record Keeping',
    name: 'MTD Digital Setup & Training',
    description: 'Setup of MTD-compatible software and training',
    longDescription: 'Complete setup of MTD-compatible accounting software with training on digital record keeping requirements.',
    basePrice: 450,
    baseHours: 3,
    pricingModel: 'FIXED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['SOLE_TRADER', 'LANDLORD'],
    complexityFactors: [
      { field: 'hasMultipleIncomeStreams', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'Multiple income sources' },
    ],
    requirements: ['Current record system details', 'Software preferences'],
    deliverables: ['Software configuration', 'Training session', 'User guide'],
    regulatoryNotes: 'Digital records required for MTD compliance',
    tags: ['mtd itsa', 'digital', 'training'],
    isPopular: true,
  },
];

// ==================== SPECIALIST SERVICES ====================

export const specialistServices: ServiceTemplate[] = [
  {
    category: 'SPECIALIST',
    subcategory: 'Audit',
    name: 'Statutory Audit',
    description: 'Full statutory audit for companies requiring audit',
    longDescription: 'Complete statutory audit in accordance with International Standards on Auditing (UK). Includes planning, testing, and audit report.',
    basePrice: 3500,
    baseHours: 25,
    pricingModel: 'FIXED',
    billingCycle: 'ANNUALLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['ANNUALLY'],
    defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: ['LIMITED_COMPANY'],
    complexityFactors: [
      { field: 'turnover', operator: 'gt', value: 10000000, adjustmentType: 'PERCENTAGE', adjustmentValue: 40, description: 'High turnover audit' },
      { field: 'hasGroupStructure', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 60, description: 'Group audit' },
      { field: 'hasOverseasOperations', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 35, description: 'International operations' },
    ],
    requirements: ['Full accounting records', 'Bank confirmations', 'Legal confirmations', 'Board minutes'],
    deliverables: ['Audit report', 'Management letter', 'Financial statements'],
    regulatoryNotes: 'Required if turnover > £10.2m, assets > £5.1m, or employees > 50',
    tags: ['specialist', 'audit', 'statutory'],
    isPopular: false,
  },
  {
    category: 'SPECIALIST',
    subcategory: 'Forensic',
    name: 'Forensic Accounting',
    description: 'Investigation and analysis for disputes or fraud',
    longDescription: 'Specialist forensic accounting services for commercial disputes, matrimonial matters, or fraud investigations.',
    basePrice: 2500,
    baseHours: 20,
    pricingModel: 'HOURLY',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP'],
    complexityFactors: [],
    requirements: ['Case details', 'Financial records', 'Legal documentation'],
    deliverables: ['Expert report', 'Calculations', 'Court testimony if required'],
    regulatoryNotes: 'Engagement letter essential',
    tags: ['specialist', 'forensic', 'expert witness'],
    isPopular: false,
  },
  {
    category: 'SPECIALIST',
    subcategory: 'International',
    name: 'International Tax Planning',
    description: 'Cross-border tax planning and compliance',
    longDescription: 'Comprehensive international tax services including transfer pricing, double tax relief, and expatriate tax.',
    basePrice: 2000,
    baseHours: 15,
    pricingModel: 'FIXED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE', 'ANNUALLY'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['LIMITED_COMPANY'],
    complexityFactors: [
      { field: 'jurisdictionCount', operator: 'gt', value: 2, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Multiple jurisdictions' },
    ],
    requirements: ['Group structure', 'Transfer pricing documentation', 'Overseas income details'],
    deliverables: ['Tax planning report', 'Compliance checklist', 'Risk assessment'],
    regulatoryNotes: 'Transfer pricing documentation required for large groups',
    tags: ['specialist', 'international', 'tax'],
    isPopular: false,
  },
  {
    category: 'SPECIALIST',
    subcategory: 'Succession',
    name: 'Exit & Succession Planning',
    description: 'Business exit and succession planning advice',
    longDescription: 'Comprehensive exit planning including valuation, tax implications, and succession structuring.',
    basePrice: 3000,
    baseHours: 20,
    pricingModel: 'FIXED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['LIMITED_COMPANY', 'PARTNERSHIP'],
    complexityFactors: [
      { field: 'businessValue', operator: 'gt', value: 2000000, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'High value business' },
    ],
    requirements: ['Business valuation', 'Shareholder agreements', 'Pension details'],
    deliverables: ['Exit strategy report', 'Tax calculations', 'Implementation plan'],
    regulatoryNotes: 'Business Asset Disposal Relief planning essential',
    tags: ['specialist', 'exit', 'succession'],
    isPopular: false,
  },
];

// ==================== BOOKKEEPING SERVICES ====================

export const bookkeepingServices: ServiceTemplate[] = [
  {
    category: 'BOOKKEEPING',
    subcategory: 'Full Service',
    name: 'Full Bookkeeping Service',
    description: 'Complete monthly bookkeeping and reconciliation',
    longDescription: 'Comprehensive bookkeeping service including data entry, bank reconciliation, supplier payments, and sales invoicing.',
    basePrice: 300,
    baseHours: 4,
    pricingModel: 'FIXED',
    billingCycle: 'MONTHLY',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    annualEquivalent: 3600,
    frequencyOptions: ['MONTHLY', 'WEEKLY'],
    defaultFrequency: 'MONTHLY',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
    complexityFactors: [
      { field: 'transactionCount', operator: 'gt', value: 200, adjustmentType: 'FIXED', adjustmentValue: 75, description: 'High transaction volume' },
      { field: 'hasMultipleCurrencies', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'Multi-currency' },
      { field: 'requiresCreditControl', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 30, description: 'Credit control included' },
    ],
    requirements: ['Bank statements', 'Invoices', 'Receipts', 'Expense claims'],
    deliverables: ['Reconciled accounts', 'Aged reports', 'Management reports'],
    regulatoryNotes: 'MTD compatible software used',
    tags: ['bookkeeping', 'reconciliation', 'processing'],
    isPopular: true,
  },
  {
    category: 'BOOKKEEPING',
    subcategory: 'Digital',
    name: 'Digital Bookkeeping Setup',
    description: 'Setup and configuration of cloud accounting software',
    longDescription: 'Complete setup of cloud accounting software (Xero, QuickBooks, Sage) including bank feeds, chart of accounts, and integrations.',
    basePrice: 650,
    baseHours: 5,
    pricingModel: 'FIXED',
    billingCycle: 'FIXED_DATE',
    isVatApplicable: true,
    vatRate: 'STANDARD_20',
    frequencyOptions: ['FIXED_DATE'],
    defaultFrequency: 'FIXED_DATE',
    applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
    complexityFactors: [
      { field: 'hasMultipleEntities', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 50, description: 'Multiple entities' },
      { field: 'requiresIntegrations', operator: 'eq', value: true, adjustmentType: 'PERCENTAGE', adjustmentValue: 25, description: 'Third-party integrations' },
    ],
    requirements: ['Current system details', 'Bank details', 'Opening balances'],
    deliverables: ['Configured software', 'Chart of accounts', 'Training session'],
    regulatoryNotes: 'Includes 3 months support',
    tags: ['bookkeeping', 'digital', 'setup'],
    isPopular: true,
  },
];

// Combine all services
export const allServices: ServiceTemplate[] = [
  ...complianceServices,
  ...advisoryServices,
  ...mtditsaServices,
  ...specialistServices,
  ...bookkeepingServices,
];

// Service categories for UI
export const serviceCategories = [
  { id: 'COMPLIANCE', label: 'Compliance', description: 'Statutory filing and regulatory requirements', icon: 'ClipboardDocumentCheckIcon' },
  { id: 'ADVISORY', label: 'Advisory', description: 'Strategic business and tax advice', icon: 'LightBulbIcon' },
  { id: 'MTD_ITSA', label: 'MTD ITSA', description: 'Making Tax Digital for Income Tax', icon: 'ComputerDesktopIcon' },
  { id: 'SPECIALIST', label: 'Specialist', description: 'Complex and niche services', icon: 'AcademicCapIcon' },
  { id: 'BOOKKEEPING', label: 'Bookkeeping', description: 'Day-to-day record keeping', icon: 'BookOpenIcon' },
];

// Helper function to get annual cost
export function calculateAnnualCost(service: ServiceTemplate): number {
  switch (service.billingCycle) {
    case 'WEEKLY':
      return service.basePrice * 52;
    case 'MONTHLY':
      return service.basePrice * 12;
    case 'QUARTERLY':
      return service.basePrice * 4;
    case 'ANNUALLY':
      return service.basePrice;
    case 'FIXED_DATE':
      return service.basePrice;
    default:
      return service.basePrice;
  }
}

// Helper function to get monthly equivalent
export function calculateMonthlyEquivalent(service: ServiceTemplate): number {
  return calculateAnnualCost(service) / 12;
}

export default allServices;
