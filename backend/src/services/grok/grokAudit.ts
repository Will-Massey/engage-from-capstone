export type GrokActor = {
  tokenId: string;
  userId: string;
  tenantId: string;
};

type AuditClient = {
  grokConnectorAudit: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  activityLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export async function writeGrokAudit(
  tx: AuditClient,
  input: {
    ctx: GrokActor;
    proposalId: string;
    tool: string;
    summary: string;
    changes: Record<string, unknown>;
  }
): Promise<void> {
  await tx.grokConnectorAudit.create({
    data: {
      tokenId: input.ctx.tokenId,
      userId: input.ctx.userId,
      tenantId: input.ctx.tenantId,
      proposalId: input.proposalId,
      tool: input.tool,
      summary: input.summary,
      changes: JSON.stringify(input.changes),
    },
  });
  await tx.activityLog.create({
    data: {
      tenantId: input.ctx.tenantId,
      userId: input.ctx.userId,
      proposalId: input.proposalId,
      action: 'GROK_CONNECTOR',
      entityType: 'PROPOSAL',
      entityId: input.proposalId,
      description: input.summary,
      metadata: JSON.stringify({
        source: 'grok_connector',
        tool: input.tool,
        tokenId: input.ctx.tokenId,
      }),
    },
  });
}
