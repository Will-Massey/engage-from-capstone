export type ProposalLetterLine = {
  name: string;
  billingFrequency?: string | null;
  lineTotalPence?: number | null;
};

export type ProposalLetterSeed = {
  proposalReference: string;
  services: string;
  fees: string;
};

const FREQUENCY_LABEL: Record<string, string> = {
  MONTHLY: ' / month',
  QUARTERLY: ' / quarter',
  ANNUAL: ' / year',
  YEARLY: ' / year',
  ONE_TIME: ' one-off',
  WEEKLY: ' / week',
};

function formatPenceGbp(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
  });
}

export function formatProposalLetterSeed(
  reference: string,
  lines: ProposalLetterLine[]
): ProposalLetterSeed {
  const named = lines.filter((line) => line.name?.trim());
  const services = named.map((line) => line.name.trim()).join('\n');
  const fees = named
    .map((line) => {
      const amount =
        typeof line.lineTotalPence === 'number' ? formatPenceGbp(line.lineTotalPence) : '';
      const freq = FREQUENCY_LABEL[line.billingFrequency || ''] || '';
      return [line.name.trim(), amount ? `${amount}${freq}` : '']
        .filter(Boolean)
        .join(': ');
    })
    .join('\n');
  return { proposalReference: reference, services, fees };
}
