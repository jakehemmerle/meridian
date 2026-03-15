import type { PublicKey } from "@solana/web3.js";

export interface MarketSummary {
  id: string;
  pda: PublicKey;
  ticker: string;
  strikePriceMicros: bigint;
  tradingDay: number;
  yesPriceMicros: bigint | null;
  closeTimeTs: number;
  phase: "trading" | "closed" | "settled";
  outcome: "unsettled" | "yes" | "no";
  phoenixMarket: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  vault: PublicKey;
  settledPrice: bigint | null;
  settlementTs: number | null;
  yesOpenInterest: bigint;
}

export function formatMarketKey(market: Pick<MarketSummary, "ticker" | "tradingDay" | "id">) {
  return `${market.ticker}-${market.tradingDay}-${market.id}`;
}
