"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invertYesLadderToNo } from "@meridian/domain";
import { useConnection } from "@solana/wallet-adapter-react";
import type { MarketSummary } from "./model";
import {
  deserializePhoenixBook,
  parsePhoenixOrderBook,
} from "../trading/orderbook";

const POLL_INTERVAL_MS = 15_000;

export interface MarketQuote {
  bestYesBidMicros: number | null;
  bestYesAskMicros: number | null;
  bestNoBidMicros: number | null;
  bestNoAskMicros: number | null;
  impliedProbabilityMicros: number | null;
}

export type MarketQuoteMap = Record<string, MarketQuote>;

const EMPTY_QUOTE: MarketQuote = {
  bestYesBidMicros: null,
  bestYesAskMicros: null,
  bestNoBidMicros: null,
  bestNoAskMicros: null,
  impliedProbabilityMicros: null,
};

function midpointOrEdge(bid: number | null, ask: number | null): number | null {
  if (bid != null && ask != null) {
    return Math.round((bid + ask) / 2);
  }

  return ask ?? bid ?? null;
}

function buildQuote(data: Uint8Array): MarketQuote {
  const yesLadder = parsePhoenixOrderBook(deserializePhoenixBook(data as Buffer));
  const noLadder = invertYesLadderToNo(yesLadder);

  const bestYesBidMicros = yesLadder.bids[0]?.priceMicros ?? null;
  const bestYesAskMicros = yesLadder.asks[0]?.priceMicros ?? null;
  const bestNoBidMicros = noLadder.bids[0]?.priceMicros ?? null;
  const bestNoAskMicros = noLadder.asks[0]?.priceMicros ?? null;

  return {
    bestYesBidMicros,
    bestYesAskMicros,
    bestNoBidMicros,
    bestNoAskMicros,
    impliedProbabilityMicros: midpointOrEdge(bestYesBidMicros, bestYesAskMicros),
  };
}

export interface UseMarketQuotesResult {
  quotes: MarketQuoteMap;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMarketQuotes(markets: readonly MarketSummary[]): UseMarketQuotesResult {
  const { connection } = useConnection();
  const [quotes, setQuotes] = useState<MarketQuoteMap>({});
  const [loading, setLoading] = useState(markets.length > 0);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const marketKey = useMemo(
    () => markets.map((market) => market.id).sort().join("|"),
    [markets],
  );

  const refresh = useCallback(() => {
    if (markets.length === 0) {
      setQuotes({});
      setLoading(false);
      setError(null);
      return;
    }

    void connection
      .getMultipleAccountsInfo(markets.map((market) => market.phoenixMarket))
      .then((accounts) => {
        if (!mountedRef.current) return;

        const nextQuotes: MarketQuoteMap = {};

        markets.forEach((market, index) => {
          const account = accounts[index];
          if (!account?.data) {
            nextQuotes[market.id] = EMPTY_QUOTE;
            return;
          }

          try {
            nextQuotes[market.id] = buildQuote(account.data);
          } catch {
            nextQuotes[market.id] = EMPTY_QUOTE;
          }
        });

        setQuotes(nextQuotes);
        setError(null);
      })
      .catch((nextError) => {
        if (!mountedRef.current) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load market quotes",
        );
      })
      .finally(() => {
        if (mountedRef.current) {
          setLoading(false);
        }
      });
  }, [connection, markets]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(markets.length > 0);
    refresh();

    if (markets.length === 0) {
      return () => {
        mountedRef.current = false;
      };
    }

    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [marketKey, markets.length, refresh]);

  return { quotes, loading, error, refresh };
}

export function getMarketQuote(
  quotes: MarketQuoteMap,
  marketId: string,
): MarketQuote | null {
  return quotes[marketId] ?? null;
}
