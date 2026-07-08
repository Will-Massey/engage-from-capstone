/** Client lifecycle actions and activity timeline API types. */

export interface DeleteClientResult {
  message: string;
}

export interface VerifyClientIdentityResult {
  clientId: string;
  verificationRef: string;
  verificationLink: string;
  isStub: true;
  expiresInHours: 72;
  message: string;
}

export interface ClientActivityLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  metadata: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  tenantId: string;
  userId: string | null;
  proposalId: string | null;
  user: { firstName: string; lastName: string } | null;
}
