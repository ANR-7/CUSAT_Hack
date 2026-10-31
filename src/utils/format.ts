import { CurrencyCode } from '../../server/types';

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function formatMoney(amount: number | undefined | null, currency: CurrencyCode = 'INR'): string {
  const num = Number(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] || '₹';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${sym}${Math.round(num).toLocaleString(locale)}`;
}

export function formatMoneyExact(amount: number | undefined | null, currency: CurrencyCode = 'INR'): string {
  const num = Number(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] || '₹';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${sym}${num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCompactMoney(amount: number | undefined | null, currency: CurrencyCode = 'INR'): string {
  const num = Number(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] || '₹';
  if (currency === 'INR') {
    if (Math.abs(num) >= 10000000) {
      return `${sym}${(num / 10000000).toFixed(2)}Cr`;
    }
    if (Math.abs(num) >= 100000) {
      return `${sym}${(num / 100000).toFixed(2)}L`;
    }
  } else {
    if (Math.abs(num) >= 1000000) {
      return `${sym}${(num / 1000000).toFixed(2)}M`;
    }
    if (Math.abs(num) >= 1000) {
      return `${sym}${(num / 1000).toFixed(1)}K`;
    }
  }
  return formatMoney(num, currency);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-IN', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function formatStatusLabel(status: string): string {
  if (!status) return '';
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
