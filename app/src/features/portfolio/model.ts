export interface PortfolioPosition {
  marketId: string;
  ticker: string;
  side: "yes" | "no";
  quantity: bigint;
  averageEntryPriceMicros: bigint;
  markPriceMicros: bigint | null;
}
