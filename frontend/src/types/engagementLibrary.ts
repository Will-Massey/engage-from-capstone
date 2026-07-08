/** Engagement clause library API types — aligned with backend routes and service shapes. */

export interface EngagementLibraryVersionRef {
  id: string;
  versionLabel: string;
  publishedAt: string;
  changelog: string;
}

export interface EngagementLibraryVersionListItem extends EngagementLibraryVersionRef {
  isCurrent: boolean;
  createdAt: string;
}

export interface EngagementLibraryCurrentVersion extends EngagementLibraryVersionRef {
  clauseCount: number;
}

export interface EngagementLibraryTemplateNeedingUpdate {
  id: string;
  name: string;
  updatedAt: string;
  engagementLibraryVersion?: { versionLabel: string } | null;
}

export interface EngagementLibraryTemplatesNeedingUpdateResult {
  proposalTemplates: EngagementLibraryTemplateNeedingUpdate[];
  coverLetterTemplates: EngagementLibraryTemplateNeedingUpdate[];
  totalCount: number;
}

export interface EngagementLibraryQuarterlySchedule {
  nextQuarterlyReview: string;
  currentQuarterLabel: string;
  currentQuarterPublished: boolean;
  currentQuarterPublishedAt: string | null;
  isReviewDayToday: boolean;
}

/** POST /engagement-library/publish body — aligned with backend publishSchema */
export interface PublishEngagementLibraryVersionPayload {
  versionLabel: string;
  changelog?: string;
}

export interface PublishEngagementLibraryVersionResult {
  version: EngagementLibraryVersionRef;
  proposalTemplatesFlagged: number;
  coverLetterTemplatesFlagged: number;
  changedClauseIds: string[];
}

export type QuarterlyEngagementLibrarySkippedResult = {
  skipped: true;
  reason: string;
  version?: EngagementLibraryVersionRef;
};

export type QuarterlyEngagementLibraryPublishedResult = {
  skipped: false;
  versionLabel: string;
  version: EngagementLibraryVersionRef;
  proposalTemplatesFlagged: number;
  coverLetterTemplatesFlagged: number;
  changedClauseIds: string[];
  simulated?: boolean;
};

export type QuarterlyEngagementLibraryReleaseResult =
  | QuarterlyEngagementLibrarySkippedResult
  | QuarterlyEngagementLibraryPublishedResult;
