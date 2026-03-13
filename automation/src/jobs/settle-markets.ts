import type { HermesPriceSnapshot, MeridianTicker } from "@meridian/domain";
import { retryWithBackoff } from "./retry.js";
import { FAILURE_CODES, getErrorMessage, type JobStatus, type FailureCode } from "./types.js";

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
  failureCode?: FailureCode;
}

export interface EscalationMarket {
  ticker: string;
  strikePrice: number;
  meridianMarket: string;
  failureCode: FailureCode;
  error: string;
  adminOverrideAvailableAfterTs: number;
}

export interface EscalationSignal {
  requiresAdminOverride: boolean;
  failedMarkets: EscalationMarket[];
}

export interface SettleMarketsJobResult {
  status: JobStatus;
  job: "settle-markets";
  detail: string;
  settlements: SettlementResult[];
  escalation?: EscalationSignal;
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

  const settlements = await Promise.all(
    activeMarkets.map(async (market): Promise<SettlementResult> => {
      // Step 1: Fetch settlement price with retry
      const priceResult = await retryWithBackoff(
        () => fetchSettlementPrice(market.ticker, market.marketCloseUtc),
        retryConfig,
      );

      if (!priceResult.ok) {
        return {
          ticker: market.ticker,
          strikePrice: market.strikePrice,
          meridianMarket: market.meridianMarket,
          status: "error",
          error: priceResult.error.message,
          failureCode: FAILURE_CODES.ORACLE_FETCH_FAILED,
        };
      }

      // Step 2: Settle on-chain
      try {
        const { txSignature } = await settleMarketOnChain(market, priceResult.value);
        return {
          ticker: market.ticker,
          strikePrice: market.strikePrice,
          meridianMarket: market.meridianMarket,
          status: "success",
          txSignature,
        };
      } catch (err) {
        return {
          ticker: market.ticker,
          strikePrice: market.strikePrice,
          meridianMarket: market.meridianMarket,
          status: "error",
          error: getErrorMessage(err),
          failureCode: FAILURE_CODES.SETTLEMENT_TX_FAILED,
        };
      }
    }),
  );

  const allSuccess = settlements.every((s) => s.status === "success");
  const allError = settlements.every((s) => s.status === "error");
  const successCount = settlements.filter((s) => s.status === "success").length;

  const failedSettlements = settlements.filter((s) => s.status === "error");
  const escalation: EscalationSignal | undefined =
    failedSettlements.length > 0
      ? {
          requiresAdminOverride: true,
          failedMarkets: failedSettlements.map((s) => {
            const market = activeMarkets.find(
              (m) => m.meridianMarket === s.meridianMarket,
            )!;
            return {
              ticker: s.ticker,
              strikePrice: s.strikePrice,
              meridianMarket: s.meridianMarket,
              failureCode: s.failureCode!,
              error: s.error!,
              adminOverrideAvailableAfterTs: market.marketCloseUtc + 3600,
            };
          }),
        }
      : undefined;

  return {
    status: allSuccess ? "success" : allError ? "error" : "partial",
    job: "settle-markets",
    detail: `Settled ${successCount}/${settlements.length} markets.`,
    settlements,
    escalation,
  };
}
