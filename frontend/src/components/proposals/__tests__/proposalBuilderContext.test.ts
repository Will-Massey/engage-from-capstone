import { describe, expect, it } from 'vitest';
import {
  buildProposalSavePayload,
  buildSelectedServiceLine,
  collectProposalValidationErrors,
  isServiceLineAlreadySelected,
  mapCatalogueVatPercent,
} from '../builder/proposalBuilderActions';
import type { Client, SelectedService, Service } from '../builder/shared';

const sampleClient: Client = {
  id: 'client-1',
  name: 'Acme Ltd',
  companyType: 'LIMITED_COMPANY',
  contactEmail: 'billing@acme.test',
};

const catalogueService: Service = {
  id: 'svc-bookkeeping',
  name: 'Bookkeeping',
  description: 'Monthly books',
  priceAmount: 85,
  priceDisplayMode: 'PER_MONTH',
  billingCycle: 'MONTHLY',
  defaultFrequency: 'MONTHLY',
  category: 'COMPLIANCE',
  isVatApplicable: true,
  vatRate: 20,
};

const selectedLine = (overrides: Partial<SelectedService> = {}): SelectedService => ({
  ...catalogueService,
  id: 'line-1',
  templateId: catalogueService.id,
  quantity: 1,
  discountPercent: 0,
  displayPrice: 85,
  annualEquivalent: 1020,
  lineTotal: 85,
  vatRate: 20,
  vatAmount: 17,
  grossTotal: 102,
  allowedCadences: ['MONTHLY'],
  ...overrides,
});

describe('ProposalBuilderContext actions', () => {
  describe('mapCatalogueVatPercent', () => {
    it('maps standard, reduced, and exempt catalogue VAT rates', () => {
      expect(mapCatalogueVatPercent(catalogueService)).toBe(20);
      expect(mapCatalogueVatPercent({ ...catalogueService, vatRate: 'REDUCED_5' })).toBe(5);
      expect(mapCatalogueVatPercent({ ...catalogueService, vatRate: 'ZERO' })).toBe(0);
      expect(mapCatalogueVatPercent({ ...catalogueService, isVatApplicable: false })).toBe(0);
    });
  });

  describe('buildSelectedServiceLine', () => {
    it('creates a priced line with catalogue VAT when includeVat is true', () => {
      const line = buildSelectedServiceLine(catalogueService, {
        includeVat: true,
        lineId: 'line-x',
      });
      expect(line.id).toBe('line-x');
      expect(line.templateId).toBe('svc-bookkeeping');
      expect(line.displayPrice).toBe(85);
      expect(line.vatRate).toBe(20);
      expect(line.grossTotal).toBe(102);
    });

    it('zeroes VAT on the line when includeVat is false', () => {
      const line = buildSelectedServiceLine(catalogueService, { includeVat: false });
      expect(line.vatRate).toBe(0);
      expect(line.grossTotal).toBe(85);
    });

    it('honours override price and billing frequency', () => {
      const line = buildSelectedServiceLine(catalogueService, {
        includeVat: true,
        overridePrice: 500,
        billingFrequency: 'ONE_TIME',
      });
      expect(line.displayPrice).toBe(500);
      expect(line.billingCycle).toBe('ONE_TIME');
      expect(line.oneOffDueDate).toBe('');
    });
  });

  describe('isServiceLineAlreadySelected', () => {
    it('detects duplicate catalogue template ids', () => {
      expect(isServiceLineAlreadySelected([selectedLine()], catalogueService.id)).toBe(true);
      expect(isServiceLineAlreadySelected([], catalogueService.id)).toBe(false);
    });
  });

  describe('collectProposalValidationErrors', () => {
    const todayIso = '2026-07-07';
    const validCover =
      'Thank you for considering our proposal. We look forward to supporting your business with reliable compliance and advisory services throughout the year.';

    it('returns no errors for a complete draft', () => {
      expect(
        collectProposalValidationErrors({
          selectedClient: sampleClient,
          selectedServices: [selectedLine()],
          proposalTitle: 'Annual compliance',
          validUntil: '2026-08-01',
          todayIso,
          coverLetter: validCover,
        })
      ).toEqual([]);
    });

    it('flags missing client, services, title, expiry, and cover letter', () => {
      const errors = collectProposalValidationErrors({
        selectedClient: null,
        selectedServices: [],
        proposalTitle: '  ',
        validUntil: '',
        todayIso,
        coverLetter: '',
      });
      expect(errors).toContain('Select a client');
      expect(errors).toContain('Add at least one service');
      expect(errors).toContain('Enter a proposal title');
      expect(errors).toContain('Set a proposal expiry date');
      expect(errors).toContain('Generate the client proposal letter before saving');
    });

    it('rejects past expiry dates and very short cover letters', () => {
      const errors = collectProposalValidationErrors({
        selectedClient: sampleClient,
        selectedServices: [selectedLine()],
        proposalTitle: 'Title',
        validUntil: '2026-07-01',
        todayIso,
        coverLetter: 'Too short',
      });
      expect(errors).toContain('Expiry date must be today or in the future');
      expect(errors).toContain(
        'Proposal letter is very short — regenerate with Clara or expand it'
      );
    });

    it('flags catalogue lines missing templateId', () => {
      const errors = collectProposalValidationErrors({
        selectedClient: sampleClient,
        selectedServices: [selectedLine({ templateId: '' })],
        proposalTitle: 'Title',
        validUntil: '2026-08-01',
        todayIso,
        coverLetter: validCover,
      });
      expect(errors[0]).toMatch(/not linked to your catalogue/);
    });
  });

  describe('buildProposalSavePayload', () => {
    it('maps selected lines to API service payload with dates and custom fields', () => {
      const payload = buildProposalSavePayload({
        selectedClient: sampleClient,
        selectedServices: [
          selectedLine({
            billingCycle: 'ONE_TIME',
            oneOffDueDate: '2026-09-15',
          }),
        ],
        proposalTitle: 'Annual compliance',
        validUntil: '2026-08-01',
        contractStartDate: '2026-08-15',
        coverLetter: '  Client letter body  ',
        proposalTerms: ' Standard terms ',
        defaultPaymentTermsDays: 30,
        includeVat: true,
        offerThreePackages: true,
        pricingTiers: [],
        requireTwoSigners: true,
      });

      expect(payload.clientId).toBe('client-1');
      expect(payload.title).toBe('Annual compliance');
      expect(payload.validUntil).toBe('2026-08-01T12:00:00.000Z');
      expect(payload.contractStartDate).toBe('2026-08-15T12:00:00.000Z');
      expect(payload.coverLetter).toBe('Client letter body');
      expect(payload.terms).toBe('Standard terms');
      expect(payload.paymentTerms).toBe('30 days');
      expect(payload.services[0]).toMatchObject({
        serviceId: 'svc-bookkeeping',
        billingFrequency: 'ONE_TIME',
        oneOffDueDate: '2026-09-15',
        vatRate: 20,
      });
      expect(payload.customFields).toMatchObject({
        offerThreePackages: true,
        requiredSigners: 2,
      });
    });

    it('strips VAT from payload when includeVat is false', () => {
      const payload = buildProposalSavePayload({
        selectedClient: sampleClient,
        selectedServices: [selectedLine()],
        proposalTitle: 'VAT off',
        validUntil: '2026-08-01',
        contractStartDate: '',
        coverLetter: 'Letter long enough to pass validation checks for the builder save path.',
        proposalTerms: '',
        defaultPaymentTermsDays: 1,
        includeVat: false,
        offerThreePackages: false,
        pricingTiers: [],
        requireTwoSigners: false,
      });

      expect(payload.services[0].vatRate).toBe(0);
      expect(payload.paymentTerms).toBe('1 day');
      expect(payload.terms).toBeUndefined();
    });
  });
});
