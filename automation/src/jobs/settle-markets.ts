import type { HermesPriceSnapshot, MeridianTicker } from "@meridian/domain";
import { retryWithBackoff } from "./retry.js";
import type { JobStatus } from "./types.js";

export interface ActiveMarket {
  ticker: string;
  strikePrice: number;
  meridianMarket: string;
  marketCloseUtc: number;
}

export interface SettleMarketsDeps {
  activeMarkets: ActiveMarket[];
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

export interface SettlementResult {
  ticker: string;
  strikePrice: number;
  meridianMarket: string;
  status: "success" | "error";
  txSignature?: string;
  error?: string;
  failureCode?: string;
}

export interface SettleMarketsJobResult {
  status: JobStatus;
  job: "settle-markets";
  detail: string;
  settlements: SettlementResult[];
}

export async function runSettleMarketsJob(
  deps?: SettleMarketsDeps,
): Promise<SettleMarketsJobResult> {
  if (!deps) {
    return {
      status: "error",
      job: "settle-markets",
      detail: "No dependencies provided.",
      settlements: [],
    };
  }

  const { activeMarkets, fetchSettlementPrice, settleMarketOnChain, retryConfig } = deps;
  const settlements: SettlementResult[] = [];

  for (const market of activeMarkets) {
    // Step 1: Fetch settlement price with retry
    const priceResult = await retryWithBackoff(
      () => fetchSettlementPrice(market.ticker, market.marketCloseUtc),
      retryConfig,
    );

    if (!priceResult.ok) {
      settlements.push({
        ticker: market.ticker,
        strikePrice: market.strikePrice,
        meridianMarket: market.meridianMarket,
        status: "error",
        error: priceResult.error.message,
        failureCode: "ORACLE_FETCH_FAILED",
      });
      continue;
    }

    // Step 2: Settle on-chain
    try {
      const { txSignature } = await settleMarketOnChain(market, priceResult.value);
      settlements.push({
        ticker: market.ticker,
        strikePrice: market.strikePrice,
        meridianMarket: market.meridianMarket,
        status: "success",
        txSignature,
      });
    } catch (err) {
      settlements.push({
        ticker: market.ticker,
        strikePrice: market.strikePrice,
        meridianMarket: market.meridianMarket,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        failureCode: "SETTLEMENT_TX_FAILED",
      });
    }
  }

  const allSuccess = settlements.every((s) => s.status === "success");
  const allError = settlements.every((s) => s.status === "error");
  const successCount = settlements.filter((s) => s.status === "success").length;

  return {
    status: allSuccess ? "success" : allError ? "error" : "partial",
    job: "settle-markets",
    detail: `Settled ${successCount}/${settlements.length} markets.`,
    settlements,
  };
}
