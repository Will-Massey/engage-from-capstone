/**
 * Contingent fee calculator for tax advisory engagements.
 * Fee = percent of estimated saving, optionally capped and floored.
 */

export interface ContingentFeeInput {
  estimatedSavingGbp: number;
  percentOfSaving: number;
  capGbp?: number;
  floorGbp?: number;
}

export interface ContingentFeeResult {
  feeGbp: number;
  explanation: string;
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function calculateContingentFee(input: ContingentFeeInput): ContingentFeeResult {
  const { estimatedSavingGbp, percentOfSaving, capGbp, floorGbp } = input;

  if (!Number.isFinite(estimatedSavingGbp) || estimatedSavingGbp <= 0) {
    throw new Error('Estimated saving must be a positive number');
  }
  if (!Number.isFinite(percentOfSaving) || percentOfSaving <= 0 || percentOfSaving > 100) {
    throw new Error('Percent of saving must be between 0 and 100 (exclusive of 0)');
  }
  if (capGbp != null && (!Number.isFinite(capGbp) || capGbp < 0)) {
    throw new Error('Cap must be a non-negative number');
  }
  if (floorGbp != null && (!Number.isFinite(floorGbp) || floorGbp < 0)) {
    throw new Error('Floor must be a non-negative number');
  }
  if (capGbp != null && floorGbp != null && floorGbp > capGbp) {
    throw new Error('Floor cannot exceed cap');
  }

  let feeGbp = Math.round(estimatedSavingGbp * (percentOfSaving / 100) * 100) / 100;
  const notes: string[] = [];

  notes.push(`${percentOfSaving}% of estimated tax saving of ${formatGbp(estimatedSavingGbp)}`);

  if (capGbp != null && feeGbp > capGbp) {
    feeGbp = capGbp;
    notes.push(`capped at ${formatGbp(capGbp)}`);
  }

  if (floorGbp != null && feeGbp < floorGbp) {
    feeGbp = floorGbp;
    notes.push(`minimum fee of ${formatGbp(floorGbp)} applied`);
  }

  feeGbp = Math.round(feeGbp * 100) / 100;

  const explanation = `Contingent fee of ${formatGbp(feeGbp)} based on ${notes.join(', ')}.`;

  return { feeGbp, explanation };
}