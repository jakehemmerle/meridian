"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  deserializeMeridianMarket,
  MERIDIAN_MARKET_ACCOUNT_SIZE,
} from "../../lib/solana/market-account";
import type { MarketSummary } from "./model";

const PROGRAM_ID = new PublicKey(
  "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

const POLL_INTERVAL_MS = 15_000;

export interface UseMarketListResult {
  markets: MarketSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMarketList(): UseMarketListResult {
  const { connection } = useConnection();
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchMarkets = useCallback(async () => {
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: MERIDIAN_MARKET_ACCOUNT_SIZE }],
      });

      if (!mountedRef.current) return;

      const parsed: MarketSummary[] = accounts.map(({ pubkey, account }) => {
        const market = deserializeMeridianMarket(account.data);
        return {
          id: pubkey.toBase58(),
          ticker: market.ticker,
          strikePriceMicros: market.strikePrice,
          tradingDay: market.tradingDay,
          yesPriceMicros: null, // Price comes from orderbook, not on-chain state
          closeTimeTs: market.closeTimeTs,
          phase: market.phase,
          outcome: market.outcome,
          settledPrice: market.settledPrice > 0n ? market.settledPrice : null,
          settlementTs: market.settlementTs > 0 ? market.settlementTs : null,
          yesOpenInterest: market.yesOpenInterest,
        };
      });

      setMarkets(parsed);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch markets");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    mountedRef.current = true;
    fetchMarkets();

    const intervalId = setInterval(fetchMarkets, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchMarkets]);

  return { markets, loading, error, refresh: fetchMarkets };
}
