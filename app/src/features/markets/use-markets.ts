"use client";

import { useCallback, useEffect, useState } from "react";
import { useProgram } from "../../lib/solana/program";
import type { MarketSummary, MarketPhase, MarketOutcome } from "./model";

const TICKER_NAMES: Record<string, string> = {
  aapl: "AAPL",
  msft: "MSFT",
  googl: "GOOGL",
  amzn: "AMZN",
  nvda: "NVDA",
  meta: "META",
  tsla: "TSLA",
};

function tickerToName(ticker: Record<string, unknown>): string {
  const key = Object.keys(ticker)[0]?.toLowerCase();
  return key ? (TICKER_NAMES[key] ?? key.toUpperCase()) : "???";
}

function phaseToString(
  phase: Record<string, unknown>,
): MarketPhase {
  if ("trading" in phase) return "Trading";
  if ("closed" in phase) return "Closed";
  if ("settled" in phase) return "Settled";
  return "Trading";
}

function outcomeToString(
  outcome: Record<string, unknown>,
): MarketOutcome {
  if ("unsettled" in outcome) return "Unsettled";
  if ("yes" in outcome) return "Yes";
  if ("no" in outcome) return "No";
  return "Unsettled";
}

export function useMarkets() {
  const program = useProgram();
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    try {
      const accounts = await (program.account as any).meridianMarket.all();
      const results: MarketSummary[] = accounts.map((acc: any) => ({
        id: acc.publicKey.toBase58(),
        pda: acc.publicKey,
        ticker: tickerToName(acc.account.ticker),
        strikePriceMicros: BigInt(acc.account.strikePrice.toString()),
        tradingDay: acc.account.tradingDay,
        yesPriceMicros: null,
        closeTimeTs: acc.account.closeTimeTs?.toNumber?.() ?? Number(acc.account.closeTimeTs),
        phase: phaseToString(acc.account.phase),
        outcome: outcomeToString(acc.account.outcome),
        phoenixMarket: acc.account.phoenixMarket,
        yesMint: acc.account.yesMint,
        noMint: acc.account.noMint,
        vault: acc.account.vault,
        settledPrice: acc.account.settledPrice ? BigInt(acc.account.settledPrice.toString()) || null : null,
        settlementTs: acc.account.settlementTs?.toNumber?.() ?? (acc.account.settlementTs ? Number(acc.account.settlementTs) : null),
        yesOpenInterest: BigInt(acc.account.yesOpenInterest?.toString() ?? "0"),
      }));
      setMarkets(results);
    } catch (err) {
      console.error("Failed to discover markets:", err);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { markets, loading, refresh };
}
