import {
  MERIDIAN_TICKER_FEEDS,
  MERIDIAN_TICKERS,
  type MeridianTicker,
  type HermesPriceSnapshot,
  generateStrikes,
  pythPriceToDollars,
  getTradingDaySchedule,
} from "@meridian/domain";

import type { JobStatus, JobFailure } from "./types.js";

export interface MorningJobDeps {
  fetchPriceSnapshots: (feedIds: readonly string[]) => Promise<HermesPriceSnapshot[]>;
  createMarketOnChain: (
    ticker: string,
    strikePrice: number,
    tradingDay: number,
  ) => Promise<{ meridianMarket: string; yesMint: string }>;
  createPhoenixMarket: (
    ticker: string,
    strikePrice: number,
    tradingDay: number,
    meridianMarket: string,
    yesMint: string,
  ) => Promise<{ phoenixMarket: string }>;
  tradingDate: Date;
}

export interface StrikeResult {
  strikePrice: number;
  status: "success" | "error";
  meridianMarket?: string;
  yesMint?: string;
  phoenixMarket?: string;
  error?: string;
}

export interface TickerResult {
  ticker: string;
  status: "success" | "partial" | "error";
  previousClose?: number;
  strikes: StrikeResult[];
  error?: string;
}

export interface MorningJobResult {
  status: JobStatus;
  job: "morning-job";
  detail: string;
  tickerResults: TickerResult[];
}

export async function runMorningJob(deps: MorningJobDeps): Promise<MorningJobResult> {
  const { fetchPriceSnapshots, createMarketOnChain, createPhoenixMarket, tradingDate } = deps;
  const schedule = getTradingDaySchedule(tradingDate);
  const feedIds = Object.values(MERIDIAN_TICKER_FEEDS);

  // Step 1: Batch-fetch Pyth prices
  const snapshots = await fetchPriceSnapshots(feedIds);

  // Build feed→snapshot map
  const snapshotMap = new Map<string, HermesPriceSnapshot>();
  for (const snap of snapshots) {
    snapshotMap.set(snap.id, snap);
  }

  // Step 2: Process each ticker independently
  const tickerResults: TickerResult[] = [];

  for (const ticker of MERIDIAN_TICKERS) {
    const feedId = MERIDIAN_TICKER_FEEDS[ticker];
    const snapshot = snapshotMap.get(feedId);

    if (!snapshot) {
      tickerResults.push({
        ticker,
        status: "error",
        strikes: [],
        error: `No price snapshot found for ${ticker}`,
      });
      continue;
    }

    // Convert price to dollars
    let previousClose: number;
    try {
      previousClose = pythPriceToDollars(snapshot.price.price, snapshot.price.expo);
      if (previousClose <= 0) {
        throw new Error(`Invalid price for ${ticker}: ${previousClose}`);
      }
    } catch (err) {
      tickerResults.push({
        ticker,
        status: "error",
        strikes: [],
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Generate strikes
    const strikePrices = generateStrikes(previousClose);
    const strikeResults: StrikeResult[] = [];

    for (const strikePrice of strikePrices) {
      try {
        const { meridianMarket, yesMint } = await createMarketOnChain(
          ticker,
          strikePrice,
          schedule.marketCloseUtc,
        );

        const { phoenixMarket } = await createPhoenixMarket(
          ticker,
          strikePrice,
          schedule.marketCloseUtc,
          meridianMarket,
          yesMint,
        );

        strikeResults.push({
          strikePrice,
          status: "success",
          meridianMarket,
          yesMint,
          phoenixMarket,
        });
      } catch (err) {
        strikeResults.push({
          strikePrice,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const allSuccess = strikeResults.every((s) => s.status === "success");
    const allError = strikeResults.every((s) => s.status === "error");

    tickerResults.push({
      ticker,
      status: allSuccess ? "success" : allError ? "error" : "partial",
      previousClose,
      strikes: strikeResults,
    });
  }

  const allSuccess = tickerResults.every((t) => t.status === "success");
  const allError = tickerResults.every((t) => t.status === "error");
  const successCount = tickerResults.filter((t) => t.status === "success").length;

  return {
    status: allSuccess ? "success" : allError ? "error" : "partial",
    job: "morning-job",
    detail: `Processed ${tickerResults.length} tickers: ${successCount} success, ${tickerResults.length - successCount} with issues.`,
    tickerResults,
  };
}
