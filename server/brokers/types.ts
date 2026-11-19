export type BrokerId =
  | 'fyers'
  | 'zerodha'
  | 'dhan'
  | 'upstox'
  | 'angelone';

export type BrokerAvailability = 'active' | 'coming_soon';

export interface BrokerProfile {
  name?: string;
  clientId?: string;
  email?: string;
  // Preserve legacy Fyers field aliases for frontend compatibility
  fy_id?: string;
  email_id?: string;
}

export interface BrokerConnectionRecord {
  brokerId: BrokerId;
  accessToken: string;
  refreshToken?: string;
  profile: BrokerProfile | null;
  connectedAt: number;
  updatedAt: number;
}

export interface BrokerCatalogItem {
  id: BrokerId;
  name: string;
  shortName: string;
  exchangeCoverage: string;
  availability: BrokerAvailability;
  authType: 'OAuth 2.0' | 'API Token';
  capabilities: {
    historicalCandles: boolean;
    liveQuotes: boolean;
    orderExecution: boolean;
    autoRefresh: boolean;
  };
  docsUrl: string;
  description: string;
}

export interface BrokerPublicStatus {
  id: BrokerId;
  name: string;
  shortName: string;
  exchangeCoverage: string;
  availability: BrokerAvailability;
  authType: 'OAuth 2.0' | 'API Token';
  configured: boolean;
  connected: boolean;
  profile: BrokerProfile | null;
  connectedAt: number | null;
  autoRefreshEnabled: boolean;
  callbackUrl: string | null;
  capabilities: BrokerCatalogItem['capabilities'];
  description: string;
}

/**
 * Standard adapter contract for plugging additional NSE brokers
 * (Zerodha Kite, Dhan HQ, Upstox v2, Angel One SmartAPI) into NeoAlgo.
 */
export interface BrokerAdapter {
  readonly id: BrokerId;
  isConfigured(): boolean;
  getCallbackPath(): string;
  buildAuthUrl(state: string, appUrl: string): { url: string; redirectUri: string };
}
