/**
 * R4.3 — Engage proposal template library validation.
 *
 * Guards the ICAEW/ACCA-aligned library data that seeds every tenant:
 *  - every package entry is schema-valid and resolves to real catalogue services
 *  - every catalogue service uses valid Prisma enum values
 *  - names are globally unique (the seeder dedupes by name)
 *  - the pre-R4.3 library (143 entries) stays byte-identical
 *  - the library covers 100+ packages across the UK practice service matrix
 */
import { describe, expect, it } from '@jest/globals';
import {
  getUkProposalTemplatePackages,
  getUkProposalTemplatePackageCount,
  ProposalTemplatePackageDef,
} from '../../data/ukProposalTemplatePackages.js';
import { allServices } from '../../data/ukAccountancyServices.js';
import baseline from './fixtures/ukProposalTemplatePackages.baseline.json';

// Prisma enum values (schema.prisma) — the catalogue seeder writes these directly.
const SERVICE_CATEGORIES = [
  'COMPLIANCE',
  'ADVISORY',
  'TAX',
  'PAYROLL',
  'BOOKKEEPING',
  'AUDIT',
  'CONSULTING',
  'TECHNICAL',
  'SPECIALIZED',
];
const BILLING_CYCLES = ['FIXED_DATE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME'];
const VAT_RATES = ['ZERO', 'REDUCED_5', 'STANDARD_20', 'EXEMPT'];
const PRICING_MODELS = ['FIXED', 'HOURLY', 'TIERED'];

const ENTITY_TYPES = [
  'LIMITED_COMPANY',
  'LLP',
  'SOLE_TRADER',
  'PARTNERSHIP',
  'CHARITY',
  'NON_PROFIT',
];

// Merge fields supported by the cover-letter engine
// (coverLetterMergeContext.ts + renderTemplate aliases in defaultCoverLetters.ts).
const SUPPORTED_PLACEHOLDERS = new Set([
  'clientName',
  'client',
  'contactName',
  'companyName',
  'clientCompany',
  'businessName',
  'servicesSummary',
  'services',
  'serviceList',
  'discussionDate',
  'date',
  'meetingDate',
  'tenantName',
  'firmName',
  'practiceName',
  'senderName',
  'name',
  'senderPosition',
  'title',
  'senderTitle',
  'position',
  'firmExperience',
  'experience',
  'yearsExperience',
  'sectorOrRegion',
  'sector',
  'region',
  'firmCredentials',
  'credentials',
  'regulated',
  'keyOutcome',
  'outcome',
  'benefit',
  'monthlyTotal',
  'serviceCount',
  'proposalReference',
  'proposalTitle',
  'professionalBody',
]);

function extractPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
}

describe('UK service catalogue (ukAccountancyServices)', () => {
  it('has unique service names', () => {
    const names = allServices.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every service is schema-valid with Prisma-compatible enum values', () => {
    for (const svc of allServices) {
      expect(svc.name.trim().length).toBeGreaterThan(0);
      expect(svc.name.length).toBeLessThanOrEqual(120);
      expect(svc.description.trim().length).toBeGreaterThan(0);
      expect(SERVICE_CATEGORIES).toContain(svc.category);
      expect(BILLING_CYCLES).toContain(svc.billingCycle);
      expect(VAT_RATES).toContain(svc.vatRate);
      expect(PRICING_MODELS).toContain(svc.pricingModel);
      expect(svc.basePrice).toBeGreaterThan(0);
      expect(Number.isFinite(svc.basePrice)).toBe(true);
      expect(svc.frequencyOptions.length).toBeGreaterThan(0);
      for (const freq of svc.frequencyOptions) {
        expect(BILLING_CYCLES).toContain(freq);
      }
      expect(svc.frequencyOptions).toContain(svc.defaultFrequency);
      expect(svc.applicableEntityTypes.length).toBeGreaterThan(0);
      expect(svc.tags.length).toBeGreaterThan(0);
    }
  });

  it('annualEquivalent is consistent with basePrice and billing cycle', () => {
    const periods: Record<string, number> = {
      WEEKLY: 52,
      MONTHLY: 12,
      QUARTERLY: 4,
      ANNUALLY: 1,
      ONE_TIME: 1,
      FIXED_DATE: 1,
    };
    for (const svc of allServices) {
      if (svc.annualEquivalent === undefined) continue;
      const annualised = svc.basePrice * periods[svc.billingCycle];
      // monthlyFromAnnual rounds to the nearest pound — allow up to £6/yr drift
      expect(Math.abs(annualised - svc.annualEquivalent)).toBeLessThanOrEqual(6);
    }
  });
});

describe('Engage proposal template library (ukProposalTemplatePackages)', () => {
  const packages = getUkProposalTemplatePackages();
  const serviceNames = new Set(allServices.map((s) => s.name));

  it('contains 100+ packages', () => {
    expect(packages.length).toBeGreaterThanOrEqual(100);
    expect(getUkProposalTemplatePackageCount()).toBe(packages.length);
  });

  it('has globally unique package names (the seeder dedupes by name)', () => {
    const names = packages.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every package is schema-valid', () => {
    for (const pkg of packages) {
      expect(pkg.name.trim().length).toBeGreaterThan(0);
      expect(pkg.name.length).toBeLessThanOrEqual(120);
      expect(pkg.description.trim().length).toBeGreaterThan(0);
      expect(pkg.description.length).toBeLessThanOrEqual(500);
      expect(pkg.title.trim().length).toBeGreaterThan(0);
      expect(ENTITY_TYPES).toContain(pkg.targetEntityType);
      expect(pkg.serviceNames.length).toBeGreaterThan(0);
    }
  });

  it('every package service resolves to a catalogue service by name', () => {
    for (const pkg of packages) {
      for (const name of pkg.serviceNames) {
        if (!serviceNames.has(name)) {
          throw new Error(`Package "${pkg.name}" references unknown service "${name}"`);
        }
      }
      // no duplicate lines within a package
      expect(new Set(pkg.serviceNames).size).toBe(pkg.serviceNames.length);
    }
  });

  it('only uses placeholders the cover-letter merge engine supports', () => {
    for (const pkg of packages) {
      const text = [pkg.name, pkg.description, pkg.title, pkg.coverLetterSnippet ?? ''].join('\n');
      for (const placeholder of extractPlaceholders(text)) {
        if (!SUPPORTED_PLACEHOLDERS.has(placeholder)) {
          throw new Error(`Package "${pkg.name}" uses unsupported placeholder {{${placeholder}}}`);
        }
      }
    }
  });

  it('covers every entity type in the UK practice service matrix', () => {
    const byEntity = new Map<string, number>();
    for (const pkg of packages) {
      byEntity.set(pkg.targetEntityType, (byEntity.get(pkg.targetEntityType) ?? 0) + 1);
    }
    for (const entity of ENTITY_TYPES) {
      expect(byEntity.get(entity) ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps every pre-R4.3 library entry byte-identical (existing tenants dedupe by name)', () => {
    const byName = new Map(packages.map((p) => [p.name, p]));
    for (const entry of baseline as ProposalTemplatePackageDef[]) {
      const current = byName.get(entry.name);
      expect(current).toBeDefined();
      expect(current).toEqual(entry);
    }
    expect(packages.length).toBeGreaterThanOrEqual((baseline as unknown[]).length);
  });
});
