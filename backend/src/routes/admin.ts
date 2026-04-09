import { Router } from 'express';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const servicesData = [
  {
    category: 'COMPLIANCE',
    name: 'Annual Accounts Preparation & Filing',
    description: 'Preparation of statutory annual accounts in accordance with UK GAAP or FRS 102, including all disclosures, notes, and electronic filing with Companies House.',
    longDescription: `We prepare your company's statutory annual accounts from your bookkeeping records, ensuring full compliance with UK GAAP, FRS 102, or FRS 105 as applicable. Our service includes: trial balance review, statutory format accounts (Statement of Financial Position, Statement of Comprehensive Income, Directors' Report, Notes to the Accounts), iXBRL tagging where required, and electronic submission to Companies House before the statutory deadline. We also advise on late filing penalties, audit exemptions, and dormant company considerations.`,
    basePrice: 850, baseHours: 6, pricingModel: 'FIXED', frequencyOptions: 'ANNUALLY', defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP', tags: 'annual-accounts,companies-house,uk-gaap,frs-102,compliance',
    isPopular: true, regulatoryNotes: 'Filing deadline: 9 months after accounting reference date (private companies). Late filing penalties from £150 to £1,500.',
  },
  {
    category: 'COMPLIANCE',
    name: 'Corporation Tax Return (CT600)',
    description: 'Preparation and electronic submission of your Corporation Tax Return (CT600) to HMRC, including tax computations and iXBRL tagging.',
    longDescription: `We calculate your company's corporation tax liability and prepare the CT600 return for electronic submission to HMRC. This includes: review of profits chargeable to corporation tax, capital allowances computations (AIA, FYA, WDA), loss relief claims, group relief considerations, R&D tax relief screening, and iXBRL tagging of computations and accounts. We ensure payment deadlines are met (9 months and 1 day after the end of the accounting period) and advise on quarterly instalment payments (QIPs) for large companies.`,
    basePrice: 650, baseHours: 4, pricingModel: 'FIXED', frequencyOptions: 'ANNUALLY', defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY', tags: 'corporation-tax,ct600,hmrc,tax-computation',
    isPopular: true, regulatoryNotes: 'Filing deadline: 12 months after the end of the accounting period. Penalties for late filing and interest on late payment apply.',
  },
  {
    category: 'COMPLIANCE',
    name: 'Prior Year Annual Accounts & CT600',
    description: 'Catch-up filing for overdue annual accounts and corporation tax returns from previous accounting periods.',
    longDescription: `If you have missed prior year filing deadlines, we can prepare and submit your overdue annual accounts and CT600 returns to bring your company back into good standing with Companies House and HMRC. This service includes: reconstruction of prior year records, preparation of statutory accounts and tax computations, negotiation with HMRC regarding penalties and interest, and advice on Time to Pay arrangements if corporation tax is outstanding. We will also advise on steps to prevent future late filing and can set up a compliance calendar for your business.`,
    basePrice: 1200, baseHours: 8, pricingModel: 'FIXED', frequencyOptions: 'ONE_TIME', defaultFrequency: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP', tags: 'catch-up,overdue,late-filing,penalty-negotiation',
    regulatoryNotes: 'Late filing penalties accumulate. Companies House may strike off a company for persistent non-compliance.',
  },
  {
    category: 'COMPLIANCE',
    name: 'Confirmation Statement (CS01)',
    description: 'Annual Confirmation Statement filing with Companies House to confirm your company details are up to date.',
    longDescription: `We prepare and file your annual Confirmation Statement (previously the Annual Return), confirming that your company's registered details are accurate and up to date. This includes verification of: registered office address, directors and secretary details, shareholders and share capital, SIC codes, and Persons with Significant Control (PSC) register. If changes are required, we will advise on the necessary filings (e.g., CH01 for director changes, SH01 for allotment of shares) and ensure the Confirmation Statement is submitted within the 14-day filing window.`,
    basePrice: 95, baseHours: 0.5, pricingModel: 'FIXED', frequencyOptions: 'ANNUALLY', defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP', tags: 'confirmation-statement,cs01,companies-house',
    regulatoryNotes: 'Must be filed at least once every 12 months. Late filing is a criminal offence and may lead to prosecution or company strike-off.',
  },
  {
    category: 'COMPLIANCE',
    name: 'Dormant Company Accounts',
    description: 'Preparation and filing of dormant company accounts for companies with no significant accounting transactions during the period.',
    longDescription: `If your company has not traded and has no significant accounting transactions during the financial year, we can prepare and file dormant company accounts (DCA) with Companies House on your behalf. This service includes: preparation of the simplified DCA form, confirmation of dormant status under the Companies Act 2006, and electronic filing. We also advise on when a company ceases to be dormant, the requirement to file full accounts, and whether the company should remain active or be voluntarily struck off.`,
    basePrice: 150, baseHours: 0.5, pricingModel: 'FIXED', frequencyOptions: 'ANNUALLY', defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY', tags: 'dormant-accounts,dca,non-trading',
    regulatoryNotes: 'A company is dormant if it has had no significant accounting transactions. Dormant companies must still file annual accounts and confirmation statements.',
  },
  {
    category: 'COMPLIANCE',
    name: 'Limited Company Formation',
    description: 'Incorporation of a new private limited company in England, Wales, Scotland, or Northern Ireland.',
    longDescription: `We handle the full company formation process from start to finish, ensuring your new business is incorporated correctly and compliantly. Our service includes: name availability check and reservation, preparation of the Memorandum and Articles of Association, completion of the IN01 form, appointment of directors and shareholders, issue of share certificates, registration for Corporation Tax with HMRC, and guidance on opening a business bank account. We also provide advice on share structure, director responsibilities, and whether your company should be limited by shares or by guarantee.`,
    basePrice: 125, baseHours: 1, pricingModel: 'FIXED', frequencyOptions: 'ONE_TIME', defaultFrequency: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY', tags: 'formation,incorporation,in01,companies-house',
    isPopular: true, regulatoryNotes: 'Companies House standard incorporation fee included. Same-day incorporation available for an additional fee.',
  },
  {
    category: 'COMPLIANCE',
    name: 'Anti-Money Laundering (AML) Check',
    description: 'Client due diligence and AML compliance checks including ID verification, source of funds checks, and risk assessment.',
    longDescription: `We conduct comprehensive Anti-Money Laundering (AML) checks to satisfy your regulatory obligations under the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (as amended). This includes: identity verification using government-issued documents, proof of address verification, Politically Exposed Persons (PEP) and sanctions screening, source of funds/source of wealth checks where required, and risk profiling (low, medium, high). We provide you with a documented risk assessment and ongoing monitoring recommendations to ensure your firm remains compliant with the requirements of your supervisory body (e.g., ICAEW, ACCA, AAT, HMRC).`,
    basePrice: 75, baseHours: 0.5, pricingModel: 'FIXED', frequencyOptions: 'ONE_TIME', defaultFrequency: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP', tags: 'aml,compliance,dued diligence,kyc,pep-check',
    regulatoryNotes: 'Required under MLRs 2017. Must be completed before engagement and refreshed periodically based on risk rating.',
  },
  {
    category: 'TAX',
    name: 'Self Assessment Tax Return',
    description: 'Preparation and submission of personal Self Assessment tax returns for sole traders, directors, landlords, and high-net-worth individuals.',
    longDescription: `We prepare your Self Assessment tax return accurately and on time, ensuring you claim all allowable reliefs and expenses while remaining fully compliant with HMRC. Our service covers: employment income (P60, P11D, P45), self-employment income and expenses, property rental income and capital gains, dividends and investment income, pension contributions and tax relief, student loan repayments, and child benefit charge calculations. We file your return online before the 31 January deadline, calculate your tax liability, and advise on payment on account requirements and any tax planning opportunities.`,
    basePrice: 295, baseHours: 2.5, pricingModel: 'FIXED', frequencyOptions: 'ANNUALLY', defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP,LIMITED_COMPANY', tags: 'self-assessment,sat,personal-tax,hmrc',
    isPopular: true, regulatoryNotes: 'Filing deadline: 31 January following the end of the tax year. Late filing penalties: £100 initial penalty, escalating thereafter.',
  },
  {
    category: 'TAX',
    name: 'VAT Return Preparation & Filing',
    description: 'Quarterly or monthly VAT return preparation, Making Tax Digital (MTD) submission, and ongoing VAT advisory.',
    longDescription: `We handle your VAT compliance from bookkeeping review to MTD-compatible submission. Our service includes: review of sales and purchase invoices for VAT accuracy, reconciliation of VAT control accounts, preparation of the VAT return (Box 1–9), submission via HMRC MTD-compatible software, and advice on VAT schemes (Standard, Flat Rate, Cash Accounting, Annual Accounting, Margin Scheme). We also advise on partial exemption calculations, EU/NI trade post-Brexit, reverse charge mechanisms for construction services (CIS), and domestic reverse charge for VAT.`,
    basePrice: 175, baseHours: 2, pricingModel: 'FIXED', frequencyOptions: 'MONTHLY,QUARTERLY,ANNUALLY', defaultFrequency: 'QUARTERLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP', tags: 'vat,mtd,hmrc,vat-return,flat-rate',
    isPopular: true, regulatoryNotes: 'MTD for VAT mandatory for VAT-registered businesses. Filing deadline: 1 month and 7 days after the end of the VAT period.',
  },
  {
    category: 'TAX',
    name: 'MTD ITSA 2026/27 Transition & Quarterly Filing',
    description: 'Full Making Tax Digital for Income Tax Self Assessment (MTD ITSA) support for businesses mandated from April 2026.',
    longDescription: `From April 2026, self-employed individuals and landlords with gross income over £50,000 must comply with MTD ITSA. We provide end-to-end transition support and ongoing quarterly filing. Our service includes: MTD-compatible cloud software setup and training, quarterly income and expense summaries, quarterly submission to HMRC, End of Period Statement (EOPS) preparation, and Final Declaration submission. We ensure your records are kept digitally, your quarterly obligations are met, and your tax position is reviewed proactively throughout the year.`,
    basePrice: 120, baseHours: 1, pricingModel: 'FIXED', frequencyOptions: 'QUARTERLY', defaultFrequency: 'QUARTERLY',
    applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP', tags: 'mtd-itsa,quarterly,hmrc,2026-27,digital-tax',
    isPopular: true, regulatoryNotes: 'Mandatory from April 2026 for sole traders and landlords with gross income over £50,000. Quarterly updates, EOPS, and Final Declaration required.',
  },
  {
    category: 'TAX',
    name: 'MTD ITSA 2027/28 Transition & Quarterly Filing',
    description: 'MTD ITSA compliance support for businesses with income over £30,000 mandated from April 2027.',
    longDescription: `From April 2027, the MTD ITSA threshold drops to £30,000, bringing thousands more self-employed individuals and landlords into scope. We help you prepare early so the transition is seamless. Our service includes: pre-mandate readiness review, MTD-compatible software migration and setup, quarterly income and expense tracking, quarterly HMRC submissions, End of Period Statement (EOPS), and Final Declaration. We also provide tailored advice on allowable expenses, capital allowances, and property income allowances to optimise your tax position under MTD ITSA.`,
    basePrice: 120, baseHours: 1, pricingModel: 'FIXED', frequencyOptions: 'QUARTERLY', defaultFrequency: 'QUARTERLY',
    applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP', tags: 'mtd-itsa,quarterly,hmrc,2027-28,digital-tax',
    regulatoryNotes: 'Mandatory from April 2027 for sole traders and landlords with gross income over £30,000.',
  },
  {
    category: 'TAX',
    name: 'P11D Benefits in Kind',
    description: 'Annual preparation and submission of P11D forms for directors and employees receiving benefits or expenses payments.',
    longDescription: `We prepare and submit P11D forms for each employee or director who has received taxable benefits or reimbursed expenses during the tax year. Our service covers: company cars and fuel benefit calculations, private medical insurance, interest-free and low-interest loans, accommodation benefits, asset transfers, and mileage payments above HMRC approved rates. We also prepare the P11D(b) return, calculate Class 1A National Insurance Contributions, and advise on payrolling of benefits as an alternative to P11D reporting.`,
    basePrice: 45, baseHours: 0.5, pricingModel: 'PER_EMPLOYEE', frequencyOptions: 'ANNUALLY', defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY', tags: 'p11d,benefits-in-kind,class-1a-nic,hmrc',
    regulatoryNotes: 'Filing deadline: 6 July following the end of the tax year. Class 1A NIC payment deadline: 19 July (22 July if paying electronically).',
  },
  {
    category: 'PAYROLL',
    name: 'Payroll — Fixed Salary Employees',
    description: 'Monthly payroll processing for employees on fixed salaries, including payslips, RTI submissions, and year-end P60s.',
    longDescription: `We run your monthly payroll for employees on fixed salaries, ensuring full HMRC Real Time Information (RTI) compliance. Our service includes: gross-to-net calculations, PAYE and National Insurance deductions, pension auto-enrolment assessments and deductions, student loan and postgraduate loan deductions, attachment of earnings orders, and generation of secure digital payslips. We submit Full Payment Submissions (FPS) on or before each payday and Employer Payment Summaries (EPS) where required. Year-end services include P60 production and P11D preparation if applicable.`,
    basePrice: 22, baseHours: 0.3, pricingModel: 'PER_EMPLOYEE', frequencyOptions: 'MONTHLY', defaultFrequency: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP', tags: 'payroll,rti,paye,payslip,p60,auto-enrolment',
    isPopular: true, regulatoryNotes: 'FPS must be submitted on or before each payday. Late filing penalties apply.',
  },
  {
    category: 'PAYROLL',
    name: 'Payroll — Variable/Hourly Employees',
    description: 'Monthly payroll processing for employees with variable hours, commissions, bonuses, or overtime.',
    longDescription: `We manage payroll complexity for employees with variable pay elements, ensuring accurate calculations and timely RTI submissions every pay run. This service includes: processing of hourly rates, overtime, commission, bonuses, and statutory payments (SSP, SMP, SAP, SPP, ShPP), PAYE and NIC calculations, pension auto-enrolment re-assessments, and secure digital payslip distribution. We also handle leaver processing (P45s), new starter declarations, and year-end reconciliations. Ideal for retail, hospitality, construction, and seasonal businesses.`,
    basePrice: 28, baseHours: 0.4, pricingModel: 'PER_EMPLOYEE', frequencyOptions: 'MONTHLY,WEEKLY', defaultFrequency: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP', tags: 'payroll,variable-pay,overtime,commission,rti',
    regulatoryNotes: 'Variable pay must be reported accurately via FPS. Statutory payment calculations must follow HMRC rates and rules.',
  },
  {
    category: 'PAYROLL',
    name: 'Auto Enrolment & Pension Submissions',
    description: 'Workplace pension auto-enrolment administration, including assessments, enrolment letters, and monthly pension submissions.',
    longDescription: `We manage your workplace pension auto-enrolment duties under the Pensions Act 2008, ensuring you remain compliant with The Pensions Regulator (TPR). Our service includes: monthly eligibility assessments for all workers, enrolment of eligible jobholders, production of statutory communications (joiner letters, opt-out notices), calculation and deduction of employee and employer contributions, and monthly data submission to your pension provider. We also handle re-enrolment every three years, opt-out and opt-in processing, and compliance with minimum contribution rates (currently 8% total, with at least 3% employer).`,
    basePrice: 12, baseHours: 0.2, pricingModel: 'PER_EMPLOYEE', frequencyOptions: 'MONTHLY', defaultFrequency: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP', tags: 'auto-enrolment,pension,tpr,workplace-pension,nest',
    regulatoryNotes: 'Employers must assess workers each pay period. Minimum total contribution: 8% (employer minimum 3%). Re-enrolment required every 3 years.',
  },
  {
    category: 'BOOKKEEPING',
    name: 'Comprehensive Bookkeeping',
    description: 'Complete monthly bookkeeping service including bank reconciliation, supplier and customer ledger management, and management reports.',
    longDescription: `Our comprehensive bookkeeping service ensures your financial records are accurate, up to date, and ready for year-end accounts and VAT returns. We handle: posting of sales and purchase invoices, bank and credit card reconciliations, supplier and customer ledger management, VAT coding and control account reconciliations, accruals and prepayments, fixed asset register maintenance, and monthly management reports (P&L, Balance Sheet, Aged Debtors/Creditors). We work with leading cloud accounting software including Xero, QuickBooks, Sage, and FreeAgent, and can provide you with real-time dashboards and cash flow visibility.`,
    basePrice: 395, baseHours: 4, pricingModel: 'FIXED', frequencyOptions: 'MONTHLY', defaultFrequency: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP', tags: 'bookkeeping,bank-reconciliation,ledgers,management-reports',
    isPopular: true, regulatoryNotes: 'Businesses must keep adequate accounting records for 6 years (HMRC requirement).',
  },
  {
    category: 'TECHNICAL',
    name: 'Xero Setup & Integration',
    description: 'Full Xero cloud accounting software implementation, including bank feed setup, chart of accounts tailoring, and user training.',
    longDescription: `We implement Xero from scratch or migrate your existing data, ensuring your cloud accounting is configured correctly for your business. Our service includes: company and user setup, bespoke chart of accounts configuration, bank feed connections and reconciliations, VAT scheme and MTD setup, invoice and quote branding, payroll and pension integration, apps and add-on integration (e.g., Dext, Stripe, GoCardless), and one-to-one staff training. We ensure your Xero file is compliant with UK VAT and MTD requirements and provide ongoing support as your business grows.`,
    basePrice: 650, baseHours: 5, pricingModel: 'FIXED', frequencyOptions: 'ONE_TIME', defaultFrequency: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP', tags: 'xero,cloud-accounting,software-setup,training,mtd',
    isPopular: true, regulatoryNotes: 'Xero subscription fees are separate and billed directly by Xero.',
  },
  {
    category: 'TECHNICAL',
    name: 'Xero Subscription Management',
    description: 'Ongoing Xero subscription administration, user management, and monthly health checks.',
    longDescription: `We act as your Xero administrator, ensuring your subscription remains optimised and your data stays clean and compliant. Our service includes: monthly Xero health checks (reconciliation reviews, duplicate transaction checks, VAT coding accuracy), user access management and permissions, chart of accounts adjustments, bank feed troubleshooting, software updates and feature rollouts, and quarterly review calls to maximise your use of Xero. We also liaise with Xero support on your behalf for technical issues and can recommend add-on apps to streamline your workflows.`,
    basePrice: 75, baseHours: 0.5, pricingModel: 'FIXED', frequencyOptions: 'MONTHLY', defaultFrequency: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP', tags: 'xero,subscription,admin,support,health-check',
    regulatoryNotes: 'Xero subscription fees billed separately by Xero. This service covers administration and compliance support only.',
  },
  {
    category: 'TECHNICAL',
    name: 'Dext Subscription & Setup',
    description: 'Dext (formerly Receipt Bank) implementation for automated receipt and invoice capture, including supplier rules and publishing workflows.',
    longDescription: `We set up Dext to automate your receipt and invoice processing, reducing manual data entry and improving record-keeping accuracy. Our service includes: Dext account configuration, supplier rule creation, integration with your accounting software (Xero, QuickBooks, Sage), mobile app training for directors and staff, multi-user setup, and automated publishing workflows. We configure Dext to handle VAT splits, foreign currency invoices, and mileage claims, ensuring your bookkeeping is as efficient and paperless as possible.`,
    basePrice: 350, baseHours: 2, pricingModel: 'FIXED', frequencyOptions: 'ONE_TIME', defaultFrequency: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP', tags: 'dext,receipt-bank,automation,expenses,integration',
    regulatoryNotes: 'Dext subscription fees are separate and billed directly by Dext.',
  },
  {
    category: 'SPECIALIZED',
    name: 'Registered Office Address Service',
    description: 'Use of our professional registered office address for Companies House and HMRC correspondence, with same-day mail scanning.',
    longDescription: `Use our prestigious UK registered office address for your company, ensuring your personal address remains private and your statutory mail is handled professionally. Our service includes: registered office address for Companies House and HMRC, same-day scanning and email forwarding of statutory mail, secure storage of original documents, reminder service for filing deadlines, and assistance with official correspondence from Companies House and HMRC. This is an ideal solution for home-based business owners, non-UK directors, and anyone who values privacy and professionalism.`,
    basePrice: 150, baseHours: 0.1, pricingModel: 'FIXED', frequencyOptions: 'ANNUALLY', defaultFrequency: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP', tags: 'registered-office,address,companies-house,mail-forwarding',
    isPopular: true, regulatoryNotes: 'A UK company must maintain a registered office address in the same jurisdiction where it is incorporated (England & Wales, Scotland, or Northern Ireland).',
  },
];

router.post(
  '/seed-services',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: { code: 'NO_TENANT', message: 'Tenant not resolved' } });
    }

    const result = await seedServicesForTenant(tenantId);

    res.json({
      success: true,
      data: result,
      message: `Seeded ${result.created} UK accountancy services`,
    });
  })
);

export async function findDemoTenant() {
  let tenant = await prisma.tenant.findFirst({ where: { subdomain: 'demo-practice' } });
  if (!tenant) {
    tenant = await prisma.tenant.findFirst({ where: { subdomain: 'demo' } });
  }
  return tenant;
}

export async function seedServicesForTenant(tenantId: string) {
  // Clean up old service templates only - NEVER delete proposals or client data
  await prisma.pricingRule.deleteMany({ where: { tenantId } });
  await prisma.serviceTemplate.deleteMany({ where: { tenantId } });

  // Insert full catalog in one query
  const data = servicesData.map((s) => ({
    tenantId,
    category: s.category as any,
    name: s.name,
    description: s.description,
    longDescription: s.longDescription,
    basePrice: s.basePrice,
    baseHours: s.baseHours,
    pricingModel: s.pricingModel as any,
    frequencyOptions: s.frequencyOptions,
    defaultFrequency: s.defaultFrequency as any,
    billingCycle: s.defaultFrequency as any, // Set billingCycle for frontend compatibility
    applicableEntityTypes: s.applicableEntityTypes,
    tags: s.tags,
    isActive: true,
    isPopular: s.isPopular || false,
    regulatoryNotes: s.regulatoryNotes || null,
    complexityFactors: JSON.stringify([]),
    requirements: JSON.stringify([]),
    deliverables: JSON.stringify([]),
  }));

  const result = await prisma.serviceTemplate.createMany({ data });

  return {
    created: result.count,
    totalExpected: servicesData.length,
  };
}

export default router;
