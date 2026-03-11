export const MARKET_OUTCOMES = ["Unsettled", "Yes", "No"] as const;

export type MarketOutcome = (typeof MARKET_OUTCOMES)[number];
