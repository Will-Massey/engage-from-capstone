export type SwitcherRoiInput = {
  clients: number;
  hoursPerMonth: number;
  hourlyRate: number;
  engagerPerClient: number;
  engageMonthly: number;
};

export type SwitcherRoi = {
  timeValue: number;
  engagerCost: number;
  engageMonthly: number;
  netVsEngager: number;
  paybackWeeks: string;
  annual: number;
};

export function calculateSwitcherRoi(input: SwitcherRoiInput): SwitcherRoi {
  const clients = Math.max(0, Number(input.clients) || 0);
  const hoursPerMonth = Math.max(0, Number(input.hoursPerMonth) || 0);
  const hourlyRate = Math.max(0, Number(input.hourlyRate) || 0);
  const engagerPerClient = Math.max(0, Number(input.engagerPerClient) || 0);
  const engageMonthly = Math.max(0, Number(input.engageMonthly) || 0);
  const timeValue = hoursPerMonth * hourlyRate;
  const engagerCost = clients * engagerPerClient;
  const netVsEngager = engagerCost + timeValue - engageMonthly;
  const paybackWeeks =
    engageMonthly > 0 && timeValue > 0
      ? String(Math.max(0.5, Number((engageMonthly / (timeValue / 4.33)).toFixed(1))))
      : '—';
  return {
    timeValue,
    engagerCost,
    engageMonthly,
    netVsEngager,
    paybackWeeks,
    annual: netVsEngager * 12,
  };
}

export function formatGbp(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatSwitcherRoiSummary(input: SwitcherRoiInput, roi: SwitcherRoi): string {
  return `Illustrative switch model (${input.clients} clients):
• Time value: ${formatGbp(roi.timeValue)}/mo (${input.hoursPerMonth}h × £${input.hourlyRate})
• Engager-class: ${formatGbp(roi.engagerCost)}/mo
• Engage plan: ${formatGbp(roi.engageMonthly)}/mo
• Net advantage: ${formatGbp(roi.netVsEngager)}/mo · ${formatGbp(roi.annual)}/yr
• ~${roi.paybackWeeks} weeks to recover plan cost from time alone
(Not a quote — adjust hours for your firm.)`;
}
