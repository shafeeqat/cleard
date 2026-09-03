export function formatAmount(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

// Compact form for the obligations list (no trailing .00 when it's a whole
// number), matching the Stitch mockup's "$644" / "$126.20" mix.
export function formatAmountCompact(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${hasCents ? amount.toFixed(2) : Math.round(amount)}`;
  }
}

export function formatDateShort(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const CATEGORIES = ['Loans & Credit', 'Household', 'Bill', 'Tax', 'GIRO', 'Insurance', 'Subscriptions', 'Transport', 'Other'];

export const PAYMENT_METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  debit_card: 'Debit card',
  giro: 'GIRO',
  gxs: 'GXS',
  axs: 'AXS',
  paynow: 'PayNow',
  cash: 'Cash',
  other: 'Other',
};

export const PAYMENT_METHOD_ICONS = {
  bank_transfer: 'account_balance',
  debit_card: 'credit_card',
  giro: 'autorenew',
  gxs: 'smartphone',
  axs: 'point_of_sale',
  paynow: 'qr_code_2',
  cash: 'payments',
  other: 'more_horiz',
};
