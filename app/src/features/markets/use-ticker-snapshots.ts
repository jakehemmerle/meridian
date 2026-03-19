"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildHermesLatestPriceFeedsUrl,
  MERIDIAN_TICKER_FEEDS,
  MERIDIAN_TICKERS,
  scalePriceToUsdcMicros,
  type HermesPriceSnapshot,
  type MeridianTicker,
} from "@meridian/domain";

const POLL_INTERVAL_MS = 15_000;

const FEED_TO_TICKER = new Map<string, MeridianTicker>(
  Object.entries(MERIDIAN_TICKER_FEEDS).map(([ticker, feedId]) => [
    feedId,
    ticker as MeridianTicker,
  ]),
);
const FEED_IDS = Object.values(MERIDIAN_TICKER_FEEDS) as readonly string[];

export interface TickerSnapshot {
  ticker: MeridianTicker;
  priceMicros: bigint;
  confidenceMicros: bigint;
  publishTime: number;
}

export interface UseTickerSnapshotsResult {
  snapshots: Partial<Record<MeridianTicker, TickerSnapshot>>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function buildSnapshot(
  snapshot: HermesPriceSnapshot,
): TickerSnapshot | null {
  const ticker = FEED_TO_TICKER.get(snapshot.id);
  if (!ticker) return null;
  const rawConfidence = BigInt(snapshot.price.conf);

  return {
    ticker,
    priceMicros: scalePriceToUsdcMicros(
      snapshot.price.price,
      snapshot.price.expo,
    ),
    confidenceMicros:
      rawConfidence > 0n
        ? scalePriceToUsdcMicros(rawConfidence, snapshot.price.expo)
        : 0n,
    publishTime: snapshot.price.publish_time,
  };
}

export function useTickerSnapshots(): UseTickerSnapshotsResult {
  const [snapshots, setSnapshots] = useState<
    Partial<Record<MeridianTicker, TickerSnapshot>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    void fetch(buildHermesLatestPriceFeedsUrl(FEED_IDS))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Hermes request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as HermesPriceSnapshot[];
        const nextSnapshots: Partial<Record<MeridianTicker, TickerSnapshot>> = {};

        for (const snapshot of payload) {
          const next = buildSnapshot(snapshot);
          if (next) {
            nextSnapshots[next.ticker] = next;
          }
        }

        if (!mountedRef.current) return;
        setSnapshots(nextSnapshots);
        setError(null);
      })
      .catch((nextError) => {
        if (!mountedRef.current) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to fetch live ticker snapshots",
        );
      })
      .finally(() => {
        if (mountedRef.current) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [refresh]);

  return { snapshots, loading, error, refresh };
}

export function getTickerSnapshot(
  snapshots: Partial<Record<MeridianTicker, TickerSnapshot>>,
  ticker: string,
): TickerSnapshot | null {
  return snapshots[ticker as MeridianTicker] ?? null;
}

export function listCoveredTickers(
  snapshots: Partial<Record<MeridianTicker, TickerSnapshot>>,
): MeridianTicker[] {
  return MERIDIAN_TICKERS.filter((ticker) => snapshots[ticker] != null);
}
