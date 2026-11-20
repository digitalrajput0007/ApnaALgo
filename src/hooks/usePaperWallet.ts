import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PAPER_WALLET_CONFIG,
  PaperWalletConfig,
} from '../types/strategy';

const STORAGE_PREFIX = 'neoalgo_paper_wallet_v1';

function loadLocalWallet(userId: string | null): PaperWalletConfig {
  try {
    const key = userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
    const raw =
      window.localStorage.getItem(key) ||
      window.localStorage.getItem(STORAGE_PREFIX);
    if (!raw) return DEFAULT_PAPER_WALLET_CONFIG;
    const parsed = JSON.parse(raw) as Partial<PaperWalletConfig>;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_PAPER_WALLET_CONFIG;
    }
    return {
      ...DEFAULT_PAPER_WALLET_CONFIG,
      ...parsed,
      startingCapital: Math.max(
        1000,
        Number(parsed.startingCapital) ||
          DEFAULT_PAPER_WALLET_CONFIG.startingCapital
      ),
      riskPerTradeRupees: Math.max(
        100,
        Number(parsed.riskPerTradeRupees) ||
          DEFAULT_PAPER_WALLET_CONFIG.riskPerTradeRupees
      ),
      riskPerTradePct: Math.max(
        0.1,
        Math.min(
          50,
          Number(parsed.riskPerTradePct) ||
            DEFAULT_PAPER_WALLET_CONFIG.riskPerTradePct
        )
      ),
      dailyRiskMode:
        parsed.dailyRiskMode === 'PERCENT_CAPITAL'
          ? 'PERCENT_CAPITAL'
          : 'FIXED_INR',
      maxDailyLossRupees: Math.max(
        200,
        Number(parsed.maxDailyLossRupees) ||
          DEFAULT_PAPER_WALLET_CONFIG.maxDailyLossRupees
      ),
      maxDailyLossPct: Math.max(
        0.25,
        Math.min(
          50,
          Number(parsed.maxDailyLossPct) ||
            (DEFAULT_PAPER_WALLET_CONFIG.maxDailyLossPct ?? 5)
        )
      ),
      maxLotsCap: Math.max(
        1,
        Math.min(
          500,
          Number(parsed.maxLotsCap) || DEFAULT_PAPER_WALLET_CONFIG.maxLotsCap
        )
      ),
    };
  } catch {
    return DEFAULT_PAPER_WALLET_CONFIG;
  }
}

export interface PaperWalletController {
  wallet: PaperWalletConfig;
  updateWallet: (patch: Partial<PaperWalletConfig>) => void;
  resetWalletDefaults: () => void;
  hydrateFromServer: (serverWallet: Partial<PaperWalletConfig> | null) => void;
}

export function usePaperWallet(userId: string | null): PaperWalletController {
  const [wallet, setWallet] = useState<PaperWalletConfig>(() =>
    loadLocalWallet(userId)
  );

  useEffect(() => {
    setWallet(loadLocalWallet(userId));
  }, [userId]);

  const persist = useCallback(
    (next: PaperWalletConfig) => {
      setWallet(next);
      try {
        const key = userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
      if (userId) {
        void fetch('/api/user/paper-wallet', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ wallet: next }),
        }).catch(() => {
          // Keep local copy if offline
        });
      }
    },
    [userId]
  );

  const updateWallet = useCallback(
    (patch: Partial<PaperWalletConfig>) => {
      setWallet((prev) => {
        const next: PaperWalletConfig = {
          ...prev,
          ...patch,
        };
        try {
          const key = userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore
        }
        if (userId) {
          void fetch('/api/user/paper-wallet', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ wallet: next }),
          }).catch(() => {
            // ignore
          });
        }
        return next;
      });
    },
    [userId]
  );

  const resetWalletDefaults = useCallback(() => {
    persist(DEFAULT_PAPER_WALLET_CONFIG);
  }, [persist]);

  const hydrateFromServer = useCallback(
    (serverWallet: Partial<PaperWalletConfig> | null) => {
      if (!serverWallet || typeof serverWallet !== 'object') return;
      const merged: PaperWalletConfig = {
        ...DEFAULT_PAPER_WALLET_CONFIG,
        ...serverWallet,
      };
      setWallet(merged);
      try {
        const key = userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
        window.localStorage.setItem(key, JSON.stringify(merged));
      } catch {
        // ignore
      }
    },
    [userId]
  );

  return {
    wallet,
    updateWallet,
    resetWalletDefaults,
    hydrateFromServer,
  };
}
