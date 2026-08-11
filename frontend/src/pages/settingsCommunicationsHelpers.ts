import type { TenantProposalSettings, UpdateTenantSettingsPayload } from '../types/tenants';

/**
 * The Communications and Templates & terms tabs share one form object
 * (`communicationsForm.proposals`) across three independently-labelled save
 * buttons — chase settings, proposal defaults, and proposal terms — but the
 * backend PUT merges by top-level key (`proposals` replaces the whole
 * sub-object, see backend/src/routes/tenants/settings.ts). Sending the
 * entire form on every click meant an abandoned edit in one section was
 * silently persisted by clicking Save in an unrelated section. Each builder
 * below scopes a request to only the fields its button owns.
 */

export function buildChaseSettingsPayload(
  proposals: TenantProposalSettings
): UpdateTenantSettingsPayload {
  return {
    proposals: {
      chaseSequenceEnabled: proposals.chaseSequenceEnabled,
      chaseSequenceDays: proposals.chaseSequenceDays,
    },
  };
}

export function buildProposalDefaultsPayload(
  proposals: TenantProposalSettings
): UpdateTenantSettingsPayload {
  return {
    proposals: {
      defaultExpiryDays: proposals.defaultExpiryDays,
      defaultPaymentTermsDays: proposals.defaultPaymentTermsDays,
      renewalReminderDays: proposals.renewalReminderDays,
      cancellationNoticeDays: proposals.cancellationNoticeDays,
      benchmarksOptIn: proposals.benchmarksOptIn,
      blockSendUntilAmlCleared: proposals.blockSendUntilAmlCleared,
    },
  };
}

export function buildProposalTermsPayload(
  proposals: TenantProposalSettings
): UpdateTenantSettingsPayload {
  return {
    proposals: {
      termsSource: proposals.termsSource,
      customTerms: proposals.customTerms,
    },
  };
}
