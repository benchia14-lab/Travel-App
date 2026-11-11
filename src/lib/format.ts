export function money(n: number | undefined, currency: string, compact = false) {
  if (n == null || isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: compact || Number.isInteger(n) ? 0 : 2,
      notation: compact && n >= 10000 ? 'compact' : 'standard',
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function fmtDate(iso: string | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00' : iso);
  return isNaN(+d) ? '' : d.toLocaleDateString(undefined, opts);
}

export function fmtTime(iso: string | undefined) {
  if (!iso || iso.length < 16) return '';
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dateRange(a: string, b: string) {
  if (!a) return '';
  const da = new Date(a + 'T12:00');
  const dbb = new Date((b || a) + 'T12:00');
  const sameYear = da.getFullYear() === dbb.getFullYear();
  const left = da.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const right = dbb.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return a === b || !b ? right : `${left} – ${right}`;
}

export function tripDays(a: string, b: string) {
  if (!a) return 0;
  return Math.max(1, Math.round((+new Date((b || a) + 'T12:00') - +new Date(a + 'T12:00')) / 864e5) + 1);
}

export const dayKey = (iso: string) => iso.slice(0, 10);

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN', 'THB', 'SGD', 'KRW', 'CNY', 'INR', 'AED', 'NZD', 'ZAR', 'BRL', 'IDR', 'VND', 'TRY'];
