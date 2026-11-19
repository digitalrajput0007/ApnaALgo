export function formatINR(
  value: number,
  options?: { signed?: boolean; decimals?: number }
): string {
  const signed = options?.signed ?? false;
  const decimals = options?.decimals ?? 0;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (signed) {
    if (value > 0) return `+₹${formatted}`;
    if (value < 0) return `-₹${formatted}`;
    return `₹${formatted}`;
  }
  return value < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

export function formatPoints(value: number, decimals = 1): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)} pts`;
}

export function formatPct(value: number, decimals = 2): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)}%`;
}

export interface NseMarketStatus {
  isOpen: boolean;
  label: 'NSE Open' | 'NSE Pre-Open' | 'NSE Closed';
  istTime: string;
}

export function getNseMarketStatus(now: Date = new Date()): NseMarketStatus {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const second = parts.find((p) => p.type === 'second')?.value ?? '00';
  const istTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(
    2,
    '0'
  )}:${second}`;

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const totalMins = hour * 60 + minute;

  if (!isWeekend && totalMins >= 9 * 60 + 15 && totalMins < 15 * 60 + 30) {
    return { isOpen: true, label: 'NSE Open', istTime };
  }
  if (!isWeekend && totalMins >= 9 * 60 && totalMins < 9 * 60 + 15) {
    return { isOpen: false, label: 'NSE Pre-Open', istTime };
  }
  return { isOpen: false, label: 'NSE Closed', istTime };
}
