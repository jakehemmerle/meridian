export const MARKET_PHASES = ["Trading", "Closed", "Settled"] as const;

export type MarketPhase = (typeof MARKET_PHASES)[number];
