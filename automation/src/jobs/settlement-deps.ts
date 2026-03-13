import {
  type HermesPriceSnapshot,
  validateSettlementSnapshot,
} from "@meridian/domain";

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
