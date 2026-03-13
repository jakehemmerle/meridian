import type { HermesPriceSnapshot } from "@meridian/domain";
import {
  runMarketCloseJob,
  type MarketCloseJobResult,
  type MarketClosureResult,
} from "./close-markets.js";
import {
  runSettleMarketsJob,
  type SettleMarketsJobResult,
  type ActiveMarket,
} from "./settle-markets.js";
import type { JobStatus } from "./types.js";

export interface AfternoonMarketEntry {
  ticker: string;
  strikePrice: number;
  meridianMarket: string;
  phoenixMarket: string;
  marketCloseUtc: number;
}

export interface AfternoonJobDeps {
  activeMarkets: AfternoonMarketEntry[];
  closePhoenixMarket: (phoenixMarket: string) => Promise<{ txSignature: string }>;
  closeMeridianMarket: (meridianMarket: string) => Promise<{ txSignature: string }>;
  fetchSettlementPrice: (
    ticker: string,
    marketCloseUtc: number,
  ) => Promise<HermesPriceSnapshot>;
  settleMarketOnChain: (
    market: ActiveMarket,
    snapshot: HermesPriceSnapshot,
  ) => Promise<{ settled: boolean; txSignature: string }>;
  retryConfig: { maxDurationMs: number; baseDelayMs: number };
}

export interface AfternoonJobResult {
  status: JobStatus;
  job: "afternoon-job";
  detail: string;
  closeResult: MarketCloseJobResult;
  settleResult: SettleMarketsJobResult;
}

/**
 * Afternoon automation path: close markets, then settle with retry + escalation.
 *
 * Markets that fail to close are excluded from settlement.
 * Markets that were already closed (skipped) are still eligible for settlement.
 */
export async function runAfternoonJob(
  deps: AfternoonJobDeps,
): Promise<AfternoonJobResult> {
  const {
    activeMarkets,
    closePhoenixMarket,
    closeMeridianMarket,
    fetchSettlementPrice,
    settleMarketOnChain,
    retryConfig,
  } = deps;

  // Step 1: Close all markets
  const closeResult = await runMarketCloseJob({
    activeMarkets,
    closePhoenixMarket,
    closeMeridianMarket,
  });

  // Step 2: Filter to markets that were successfully closed or already closed (skipped)
  const settleableMarkets = filterSettleableMarkets(activeMarkets, closeResult.closures);

  // Step 3: Settle markets (or return empty if none are settleable)
  let settleResult: SettleMarketsJobResult;

  if (settleableMarkets.length === 0) {
    settleResult = {
      status: "success",
      job: "settle-markets",
      detail: "No markets to settle.",
      settlements: [],
    };
  } else {
    settleResult = await runSettleMarketsJob({
      activeMarkets: settleableMarkets,
      fetchSettlementPrice,
      settleMarketOnChain,
      retryConfig,
    });
  }

  // Step 4: Derive overall status
  const status = deriveOverallStatus(closeResult, settleResult, settleableMarkets.length);

  const detail =
    `Afternoon close: ${closeResult.detail} ` +
    `Afternoon settle: ${settleResult.detail}`;

  return {
    status,
    job: "afternoon-job",
    detail,
    closeResult,
    settleResult,
  };
}

function filterSettleableMarkets(
  activeMarkets: AfternoonMarketEntry[],
  closures: MarketClosureResult[],
): ActiveMarket[] {
  const settleableSet = new Set<string>();

  for (const closure of closures) {
    if (closure.status === "success" || closure.status === "skipped") {
      settleableSet.add(closure.meridianMarket);
    }
  }

  return activeMarkets
    .filter((m) => settleableSet.has(m.meridianMarket))
    .map((m) => ({
      ticker: m.ticker,
      strikePrice: m.strikePrice,
      meridianMarket: m.meridianMarket,
      marketCloseUtc: m.marketCloseUtc,
    }));
}

function deriveOverallStatus(
  closeResult: MarketCloseJobResult,
  settleResult: SettleMarketsJobResult,
  settleableCount: number,
): JobStatus {
  // If everything succeeded
  if (closeResult.status === "success" && settleResult.status === "success") {
    return "success";
  }

  // If nothing worked at all
  if (closeResult.status === "error" && settleableCount === 0) {
    return "error";
  }

  if (settleResult.status === "error" && closeResult.status !== "error") {
    return "error";
  }

  // Everything else is partial
  return "partial";
}
