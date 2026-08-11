import { describe, it, expect } from 'vitest';
import {
  buildChaseSettingsPayload,
  buildProposalDefaultsPayload,
  buildProposalTermsPayload,
} from '../settingsCommunicationsHelpers';
import type { TenantProposalSettings } from '../../types/tenants';

const proposals: TenantProposalSettings = {
  defaultExpiryDays: 45,
  renewalReminderDays: 21,
  defaultPaymentTermsDays: 14,
  cancellationNoticeDays: 60,
  chaseSequenceEnabled: false,
  chaseSequenceDays: [5, 10],
  termsSource: 'custom',
  customTerms: 'Bespoke terms text',
  benchmarksOptIn: true,
  blockSendUntilAmlCleared: true,
};

describe('buildChaseSettingsPayload', () => {
  it('sends only the chase sequence fields', () => {
    expect(buildChaseSettingsPayload(proposals)).toEqual({
      proposals: {
        chaseSequenceEnabled: false,
        chaseSequenceDays: [5, 10],
      },
    });
  });

  it('does not leak an abandoned edit to proposal-defaults or terms fields', () => {
    const payload = buildChaseSettingsPayload(proposals);
    expect(payload.proposals).not.toHaveProperty('defaultExpiryDays');
    expect(payload.proposals).not.toHaveProperty('termsSource');
  });
});

describe('buildProposalDefaultsPayload', () => {
  it('sends only the proposal-defaults fields', () => {
    expect(buildProposalDefaultsPayload(proposals)).toEqual({
      proposals: {
        defaultExpiryDays: 45,
        defaultPaymentTermsDays: 14,
        renewalReminderDays: 21,
        cancellationNoticeDays: 60,
        benchmarksOptIn: true,
        blockSendUntilAmlCleared: true,
      },
    });
  });

  it('does not leak an abandoned edit to chase or terms fields', () => {
    const payload = buildProposalDefaultsPayload(proposals);
    expect(payload.proposals).not.toHaveProperty('chaseSequenceDays');
    expect(payload.proposals).not.toHaveProperty('termsSource');
  });
});

describe('buildProposalTermsPayload', () => {
  it('sends only the terms fields', () => {
    expect(buildProposalTermsPayload(proposals)).toEqual({
      proposals: {
        termsSource: 'custom',
        customTerms: 'Bespoke terms text',
      },
    });
  });

  it('does not leak an abandoned edit to chase or proposal-defaults fields', () => {
    const payload = buildProposalTermsPayload(proposals);
    expect(payload.proposals).not.toHaveProperty('chaseSequenceEnabled');
    expect(payload.proposals).not.toHaveProperty('defaultExpiryDays');
  });
});
