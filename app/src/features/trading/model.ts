export type TradeIntent = "buy-yes" | "buy-no" | "sell-yes" | "sell-no";

export interface TradingIntentDescriptor {
  intent: TradeIntent;
  label: string;
  bookSide: "bid" | "ask";
}

export const tradingIntentDescriptors: TradingIntentDescriptor[] = [
  { intent: "buy-yes", label: "Buy Yes", bookSide: "ask" },
  { intent: "buy-no", label: "Buy No", bookSide: "bid" },
  { intent: "sell-yes", label: "Sell Yes", bookSide: "bid" },
  { intent: "sell-no", label: "Sell No", bookSide: "ask" },
];

// --- Intent-to-action mapping ---

export interface IntentAction {
  phoenixSide: "bid" | "ask";
  direction: "buy" | "sell";
  outcomeToken: "yes" | "no";
}

const intentActions: Record<TradeIntent, IntentAction> = {
  "buy-yes": { phoenixSide: "ask", direction: "buy", outcomeToken: "yes" },
  "buy-no": { phoenixSide: "bid", direction: "buy", outcomeToken: "no" },
  "sell-yes": { phoenixSide: "bid", direction: "sell", outcomeToken: "yes" },
  "sell-no": { phoenixSide: "ask", direction: "sell", outcomeToken: "no" },
};

export function getIntentAction(intent: TradeIntent): IntentAction {
  return intentActions[intent];
}

// --- Payoff computation ---

const PRICE_UNIT = 1_000_000;

export interface PayoffInfo {
  costMicros: number;
  payoutMicros: number;
  condition: "above" | "below";
  formatDisplay: (ticker: string, strikePriceMicros: number) => string;
}

function formatMicrosAsDollars(micros: number): string {
  return `$${(micros / PRICE_UNIT).toFixed(2)}`;
}

export function computePayoff(
  intent: TradeIntent,
  priceMicros: number,
): PayoffInfo {
  const isYesSide = intent === "buy-yes" || intent === "sell-yes";
  const condition = isYesSide ? "above" : "below";

  return {
    costMicros: priceMicros,
    payoutMicros: PRICE_UNIT,
    condition,
    formatDisplay(ticker: string, strikePriceMicros: number) {
      const cost = formatMicrosAsDollars(priceMicros);
      const payout = formatMicrosAsDollars(PRICE_UNIT);
      const strike = formatMicrosAsDollars(strikePriceMicros);
      return `You pay ${cost}. You win ${payout} if ${ticker} closes ${condition} ${strike}.`;
    },
  };
}

// --- Countdown ---

export function getCountdownSeconds(
  marketCloseUtc: number,
  nowUtc: number,
): number {
  return Math.max(0, marketCloseUtc - nowUtc);
}

// --- Position constraints ---

export interface UserPosition {
  yesQuantity: bigint;
  noQuantity: bigint;
}

export interface PositionConstraints {
  canBuyYes: boolean;
  canBuyNo: boolean;
  canSellYes: boolean;
  canSellNo: boolean;
  buyYesGuidance: string | null;
  buyNoGuidance: string | null;
  sellYesGuidance: string | null;
  sellNoGuidance: string | null;
}

export function getPositionConstraints(
  position: UserPosition | null,
): PositionConstraints {
  const hasYes = position != null && position.yesQuantity > 0n;
  const hasNo = position != null && position.noQuantity > 0n;

  // During mint-pair operations, a user may transiently hold both Yes and No.
  // In that case, allow all buys (don't block).
  const isDualHolding = hasYes && hasNo;

  return {
    canBuyYes: isDualHolding || !hasNo,
    canBuyNo: isDualHolding || !hasYes,
    canSellYes: hasYes,
    canSellNo: hasNo,
    buyYesGuidance: !isDualHolding && hasNo ? "Sell your No tokens first." : null,
    buyNoGuidance: !isDualHolding && hasYes ? "Sell your Yes tokens first." : null,
    sellYesGuidance: hasYes ? null : "You need Yes tokens to sell.",
    sellNoGuidance: hasNo ? null : "You need No tokens to sell.",
  };
}
