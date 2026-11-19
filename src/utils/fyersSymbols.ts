export interface FyersPresetOption {
  symbol: string;
  label: string;
}

export const FYERS_INDEX_PRESETS: FyersPresetOption[] = [
  { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50 (NSE:NIFTY50-INDEX)' },
  { symbol: 'NSE:NIFTYBANK-INDEX', label: 'BANK NIFTY (NSE:NIFTYBANK-INDEX)' },
  { symbol: 'NSE:FINNIFTY-INDEX', label: 'FIN NIFTY (NSE:FINNIFTY-INDEX)' },
  {
    symbol: 'NSE:MIDCPNIFTY-INDEX',
    label: 'MIDCAP NIFTY (NSE:MIDCPNIFTY-INDEX)',
  },
  { symbol: 'BSE:SENSEX-INDEX', label: 'SENSEX (BSE:SENSEX-INDEX)' },
];

const SYMBOL_ALIASES: Record<string, string> = {
  NIFTY: 'NSE:NIFTY50-INDEX',
  NIFTY50: 'NSE:NIFTY50-INDEX',
  'NIFTY 50': 'NSE:NIFTY50-INDEX',
  'NSE:NIFTY': 'NSE:NIFTY50-INDEX',
  'NSE:NIFTY50': 'NSE:NIFTY50-INDEX',
  'NSE:NIFTY-INDEX': 'NSE:NIFTY50-INDEX',
  'NSE:NIFTY50-INDEX': 'NSE:NIFTY50-INDEX',

  BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
  'BANK NIFTY': 'NSE:NIFTYBANK-INDEX',
  NIFTYBANK: 'NSE:NIFTYBANK-INDEX',
  'NSE:BANKNIFTY': 'NSE:NIFTYBANK-INDEX',
  'NSE:NIFTYBANK': 'NSE:NIFTYBANK-INDEX',
  'NSE:BANKNIFTY-INDEX': 'NSE:NIFTYBANK-INDEX',
  'NSE:NIFTYBANK-INDEX': 'NSE:NIFTYBANK-INDEX',

  FINNIFTY: 'NSE:FINNIFTY-INDEX',
  'FIN NIFTY': 'NSE:FINNIFTY-INDEX',
  NIFTYFIN: 'NSE:FINNIFTY-INDEX',
  'NSE:FINNIFTY': 'NSE:FINNIFTY-INDEX',
  'NSE:NIFTYFIN': 'NSE:FINNIFTY-INDEX',
  'NSE:NIFTYFIN-INDEX': 'NSE:FINNIFTY-INDEX',
  'NSE:FINNIFTY-INDEX': 'NSE:FINNIFTY-INDEX',

  MIDCPNIFTY: 'NSE:MIDCPNIFTY-INDEX',
  MIDCAPNIFTY: 'NSE:MIDCPNIFTY-INDEX',
  'MIDCAP NIFTY': 'NSE:MIDCPNIFTY-INDEX',
  'NSE:MIDCPNIFTY': 'NSE:MIDCPNIFTY-INDEX',
  'NSE:MIDCPNIFTY-INDEX': 'NSE:MIDCPNIFTY-INDEX',

  SENSEX: 'BSE:SENSEX-INDEX',
  'BSE:SENSEX': 'BSE:SENSEX-INDEX',
  'BSE:SENSEX-INDEX': 'BSE:SENSEX-INDEX',

  BANKEX: 'BSE:BANKEX-INDEX',
  'BSE:BANKEX': 'BSE:BANKEX-INDEX',
  'BSE:BANKEX-INDEX': 'BSE:BANKEX-INDEX',

  INDIAVIX: 'NSE:INDIAVIX-INDEX',
  VIX: 'NSE:INDIAVIX-INDEX',
  'NSE:INDIAVIX': 'NSE:INDIAVIX-INDEX',
  'NSE:INDIAVIX-INDEX': 'NSE:INDIAVIX-INDEX',
};

/**
 * Normalize casual Indian market symbols into valid Fyers API v3 instrument codes.
 * Examples:
 * - "SBIN"          -> "NSE:SBIN-EQ"
 * - "NSE:SBIN"      -> "NSE:SBIN-EQ"
 * - "BSE:TCS"       -> "BSE:TCS-EQ"
 * - "BANKNIFTY"     -> "NSE:NIFTYBANK-INDEX"
 * - "FINNIFTY"      -> "NSE:FINNIFTY-INDEX"
 * - "NSE:SBIN-EQ"   -> "NSE:SBIN-EQ" (unchanged)
 * - "NSE:NIFTY25NOV24500CE" -> unchanged (options/futures)
 */
export function normalizeFyersSymbol(
  rawInput: string | null | undefined,
  fallback = 'NSE:NIFTY50-INDEX'
): string {
  const cleaned = (rawInput || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!cleaned) return fallback;

  if (SYMBOL_ALIASES[cleaned]) {
    return SYMBOL_ALIASES[cleaned];
  }

  const compact = cleaned.replace(/\s+/g, '');
  if (SYMBOL_ALIASES[compact]) {
    return SYMBOL_ALIASES[compact];
  }

  // Already has an exchange prefix like NSE:, BSE:, MCX:
  if (compact.includes(':')) {
    const [exchange, rawTicker] = compact.split(':', 2);
    if (!rawTicker) return fallback;

    // Check alias for ticker after stripping exchange
    const fullKey = `${exchange}:${rawTicker}`;
    if (SYMBOL_ALIASES[fullKey]) {
      return SYMBOL_ALIASES[fullKey];
    }

    // Already specifies a Fyers series suffix (-EQ, -INDEX, -BE, -SM, -A, etc.)
    if (rawTicker.includes('-')) {
      return `${exchange}:${rawTicker}`;
    }

    // F&O contract (ends with FUT, CE, or PE and contains digits for expiry/strike)
    if (/\d.*(FUT|CE|PE)$/.test(rawTicker)) {
      return `${exchange}:${rawTicker}`;
    }

    // Default cash equity series for NSE / BSE
    if (exchange === 'NSE' || exchange === 'BSE') {
      return `${exchange}:${rawTicker}-EQ`;
    }

    return `${exchange}:${rawTicker}`;
  }

  // No exchange prefix provided
  if (compact.includes('-')) {
    return `NSE:${compact}`;
  }

  // Bare F&O symbol like NIFTY25NOV24500CE or BANKNIFTY25NOVFUT
  if (/\d.*(FUT|CE|PE)$/.test(compact)) {
    return `NSE:${compact}`;
  }

  // Bare equity ticker like SBIN, RELIANCE, HDFCBANK, TCS, INFY
  return `NSE:${compact}-EQ`;
}
