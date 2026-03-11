export interface MarketSummary {
  id: string;
  ticker: string;
  strikePriceMicros: bigint;
  tradingDay: number;
  yesPriceMicros: bigint | null;
  closeTimeTs: number;
}

export function formatMarketKey(market: Pick<MarketSummary, "ticker" | "tradingDay" | "id">) {
  return `${market.ticker}-${market.tradingDay}-${market.id}`;
}
