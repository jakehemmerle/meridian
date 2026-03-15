"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  deserializeMeridianMarket,
  MERIDIAN_MARKET_ACCOUNT_SIZE,
} from "../../lib/solana/market-account";
import { MERIDIAN_PROGRAM_ID } from "../../lib/solana/program";
import type { MarketSummary } from "./model";

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
  const fetchingRef = useRef(false);

  const fetchMarkets = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const accounts = await connection.getProgramAccounts(MERIDIAN_PROGRAM_ID, {
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

      const serialized = JSON.stringify(parsed, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );
      setMarkets((prev) => {
        const prevSerialized = JSON.stringify(prev, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );
        return serialized === prevSerialized ? prev : parsed;
      });
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch markets");
    } finally {
      fetchingRef.current = false;
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
