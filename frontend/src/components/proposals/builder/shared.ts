import type { BillingCadence } from '../../../utils/billingCadence';
import type { PricingSummaryBands } from '@shared/proposalSummary';

// Types
export interface Client {
  id: string;
  name: string;
  companyType: string;
  contactEmail: string;
  contactName?: string | null;
  /** Annual turnover (GBP) — picks the fee benchmark turnover band */
  turnover?: number | null;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  priceAmount: number;
  priceDisplayMode: 'PER_MONTH' | 'PER_QUARTER' | 'PER_YEAR' | 'ONE_TIME';
  billingCycle: string;
  defaultFrequency?: string;
  category: string;
  frequencyOptions?: string;
  isVatApplicable?: boolean;
  vatRate?: string | number;
}

export interface SelectedService extends Service {
  /** Unique id per proposal line (for UI/editing — never sent as catalogue serviceId) */
  id: string;
  /** Catalogue template id sent to the API as `serviceId` */
  templateId: string;
  quantity: number;
  discountPercent: number;
  displayPrice: number;
  annualEquivalent: number;
  lineTotal: number;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
  /** Cadences allowed for this line (from catalog template) */
  allowedCadences: BillingCadence[];
  /** YYYY-MM-DD when billing is ONE_TIME */
  oneOffDueDate?: string;
}

export type PricingSummary = PricingSummaryBands;

export function coverLetterAddressee(client: Client): string {
  const n = client.contactName?.trim();
  return n || client.name;
}

// Format currency only
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};
