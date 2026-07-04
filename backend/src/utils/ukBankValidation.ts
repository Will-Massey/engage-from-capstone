/** UK sort code + account number format validation. Revolut validates account on counterparty create. */

function cleanDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function validateUkBankDetails(sortCode: string, accountNumber: string): {
  ok: boolean;
  message?: string;
} {
  const sort = cleanDigits(sortCode);
  const account = cleanDigits(accountNumber);

  if (sort.length !== 6) {
    return { ok: false, message: 'Sort code must be 6 digits' };
  }
  if (account.length !== 8) {
    return { ok: false, message: 'Account number must be 8 digits' };
  }

  return { ok: true };
}

export function maskAccountLast4(accountNumber: string): string {
  const digits = cleanDigits(accountNumber);
  if (digits.length < 4) return '****';
  return `****${digits.slice(-4)}`;
}