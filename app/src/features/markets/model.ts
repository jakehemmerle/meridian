export type MarketPhase = "Trading" | "Closed" | "Settled";
export type MarketOutcome = "Unsettled" | "Yes" | "No";

export interface MarketSummary {
  id: string;
  ticker: string;
  strikePriceMicros: bigint;
  tradingDay: number;
  yesPriceMicros: bigint | null;
  closeTimeTs: number;
  phase: MarketPhase;
  outcome: MarketOutcome;
  settledPrice: bigint | null;
  settlementTs: number | null;
  yesOpenInterest: bigint;
}

export function formatMarketKey(market: Pick<MarketSummary, "ticker" | "tradingDay" | "id">) {
  return `${market.ticker}-${market.tradingDay}-${market.id}`;
}
