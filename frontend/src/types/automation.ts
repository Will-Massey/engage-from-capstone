/** Tenant automation settings API types — aligned with GET /automation/settings. */

export interface AutomationEmailFollowUpStage {
  daysAfterSend: number;
  template: string;
}

export interface AutomationProposalChaseSettings {
  enabled: boolean;
  schedule: string;
  chaseSequenceDays: number[];
}

export interface AutomationEmailFollowUpSettings {
  enabled: boolean;
  schedule: string;
  stages: AutomationEmailFollowUpStage[];
}

export interface AutomationProposalExpirySettings {
  enabled: boolean;
  defaultExpiryDays: number;
  reminderDaysBefore: number;
}

export interface AutomationSettings {
  proposalChase: AutomationProposalChaseSettings;
  emailFollowUp: AutomationEmailFollowUpSettings;
  proposalExpiry: AutomationProposalExpirySettings;
}

export interface AutomationJobRunResult {
  sent: number;
  failed: number;
  skipped: number;
}
