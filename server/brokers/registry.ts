import { BrokerCatalogItem, BrokerId } from './types';

export const BROKER_CATALOG: BrokerCatalogItem[] = [
  {
    id: 'fyers',
    name: 'Fyers API v3',
    shortName: 'Fyers',
    exchangeCoverage: 'NSE · NFO · MCX · BSE',
    availability: 'active',
    authType: 'OAuth 2.0',
    capabilities: {
      historicalCandles: true,
      liveQuotes: true,
      orderExecution: true,
      autoRefresh: true,
    },
    docsUrl: 'https://myapi.fyers.in/docsv3',
    description:
      'Production integration for 5-minute NIFTY historical backtesting, 1-second live quote streaming, and automated OAuth session management.',
  },
  {
    id: 'zerodha',
    name: 'Zerodha Kite Connect',
    shortName: 'Zerodha',
    exchangeCoverage: 'NSE · NFO · MCX · BSE',
    availability: 'coming_soon',
    authType: 'OAuth 2.0',
    capabilities: {
      historicalCandles: true,
      liveQuotes: true,
      orderExecution: true,
      autoRefresh: false,
    },
    docsUrl: 'https://kite.trade/docs/connect/v3/',
    description:
      'Kite Connect v3 WebSocket ticker and historical candle adapter planned via the BrokerAdapter interface.',
  },
  {
    id: 'dhan',
    name: 'Dhan HQ API',
    shortName: 'Dhan',
    exchangeCoverage: 'NSE · NFO · MCX · BSE',
    availability: 'coming_soon',
    authType: 'API Token',
    capabilities: {
      historicalCandles: true,
      liveQuotes: true,
      orderExecution: true,
      autoRefresh: true,
    },
    docsUrl: 'https://dhanhq.co/docs/v2/',
    description:
      'Low-latency DhanHQ v2 intraday feed and super-order execution connector scheduled for upcoming release.',
  },
  {
    id: 'upstox',
    name: 'Upstox API v2',
    shortName: 'Upstox',
    exchangeCoverage: 'NSE · NFO · MCX · BSE',
    availability: 'coming_soon',
    authType: 'OAuth 2.0',
    capabilities: {
      historicalCandles: true,
      liveQuotes: true,
      orderExecution: true,
      autoRefresh: false,
    },
    docsUrl: 'https://upstox.com/developer/api-documentation/',
    description:
      'Upstox OAuth v2 market data feed and portfolio sync adapter ready for drop-in registration.',
  },
  {
    id: 'angelone',
    name: 'Angel One SmartAPI',
    shortName: 'Angel One',
    exchangeCoverage: 'NSE · NFO · MCX · BSE',
    availability: 'coming_soon',
    authType: 'API Token',
    capabilities: {
      historicalCandles: true,
      liveQuotes: true,
      orderExecution: true,
      autoRefresh: true,
    },
    docsUrl: 'https://smartapi.angelbroking.com/docs',
    description:
      'SmartAPI TOTP session and WebSocket 2.0 tick adapter planned for multi-broker portfolio execution.',
  },
];

export function getBrokerCatalogItem(id: BrokerId): BrokerCatalogItem | undefined {
  return BROKER_CATALOG.find((b) => b.id === id);
}
