/** Multi-practice firm group API types. */

export interface FirmGroupPracticeSummary {
  id: string;
  name: string;
  subdomain: string;
  isOwner: boolean;
  isCurrent: boolean;
  userCount: number;
  clientCount: number;
  joinedAt: string;
}

export interface FirmGroupContext {
  assigned: boolean;
  canAdmin: boolean;
  isOwnerPractice: boolean;
  firmGroup: {
    id: string;
    name: string;
    slug: string;
    ownerTenantId: string | null;
    practiceCount: number;
    createdAt: string;
  } | null;
  practices: FirmGroupPracticeSummary[];
  practice: { id: string; name: string; subdomain: string };
}

export interface CreateFirmGroupPayload {
  name: string;
  slug?: string;
}

export interface UpdateFirmGroupPayload {
  name: string;
}

export interface AddFirmGroupPracticePayload {
  subdomain: string;
}
