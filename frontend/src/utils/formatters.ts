/**
 * Frontend formatting utilities
 */

export const formatCurrency = (amount: number, currency: string = 'GBP'): string => {
  const n = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};
