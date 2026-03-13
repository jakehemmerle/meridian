import {
  type HermesPriceSnapshot,
  type MeridianTicker,
  MERIDIAN_TICKER_FEEDS,
  validateSettlementSnapshot,
} from "@meridian/domain";

import type { ActiveMarket, SettleMarketsDeps } from "./settle-markets.js";

/**
 * Creates a fetch function that validates settlement price snapshots.
 * Throws on validation failure so `retryWithBackoff` retries automatically.
 */
export function makeValidatedFetchSettlementPrice(
  feedId: string,
  config: { maximumAgeSeconds: number; confidenceLimitBps: number },
  innerFetch: (ticker: string, marketCloseUtc: number) => Promise<HermesPriceSnapshot>,
): (ticker: string, marketCloseUtc: number) => Promise<HermesPriceSnapshot> {
  return async (ticker: string, marketCloseUtc: number): Promise<HermesPriceSnapshot> => {
    const snapshot = await innerFetch(ticker, marketCloseUtc);

    validateSettlementSnapshot(snapshot, {
      expectedFeedId: feedId,
      marketCloseTs: marketCloseUtc,
      settlementTs: marketCloseUtc,
      maximumAgeSeconds: config.maximumAgeSeconds,
      confidenceLimitBps: config.confidenceLimitBps,
    });

    return snapshot;
  };
}

export function buildSettlementDeps(config: {
  activeMarkets: ActiveMarket[];
  oracleConfig: { maximumAgeSeconds: number; confidenceLimitBps: number };
  retryConfig: { maxDurationMs: number; baseDelayMs: number };
  settleMarketOnChain?: SettleMarketsDeps["settleMarketOnChain"];
  innerFetchForTicker?: (ticker: string, marketCloseUtc: number) => Promise<HermesPriceSnapshot>;
}): SettleMarketsDeps {
  const { activeMarkets, oracleConfig, retryConfig } = config;

  const fetchSettlementPrice: SettleMarketsDeps["fetchSettlementPrice"] = async (
    ticker: string,
    marketCloseUtc: number,
  ) => {
    const feedId = MERIDIAN_TICKER_FEEDS[ticker as MeridianTicker];
    if (!feedId) {
      throw new Error(`No Pyth feed configured for ticker: ${ticker}`);
    }

    const innerFetch = config.innerFetchForTicker ?? (async () => {
      throw new Error(`No fetch implementation provided for ${ticker}`);
    });

    const validated = makeValidatedFetchSettlementPrice(feedId, oracleConfig, innerFetch);
    return validated(ticker, marketCloseUtc);
  };

  return {
    activeMarkets,
    fetchSettlementPrice,
    settleMarketOnChain: config.settleMarketOnChain ?? (async () => {
      throw new Error("settleMarketOnChain not implemented");
    }),
    retryConfig,
  };
}
