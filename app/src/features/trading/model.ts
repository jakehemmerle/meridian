import { formatUsd, PRICE_UNIT } from "../../lib/format";

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

// --- Intent-to-instruction-plan mapping ---

export type InstructionType = "trade_yes" | "mint_pair" | "merge_pair";

export interface InstructionStep {
  type: InstructionType;
  side?: "Buy" | "Sell";
}

const intentInstructionPlans: Record<TradeIntent, InstructionStep[]> = {
  "buy-yes": [{ type: "trade_yes", side: "Buy" }],
  "buy-no": [{ type: "mint_pair" }, { type: "trade_yes", side: "Sell" }],
  "sell-yes": [{ type: "trade_yes", side: "Sell" }],
  "sell-no": [{ type: "trade_yes", side: "Buy" }, { type: "merge_pair" }],
};

export function getIntentInstructionPlan(intent: TradeIntent): InstructionStep[] {
  return intentInstructionPlans[intent];
}

// --- Payoff computation ---

export interface PayoffInfo {
  costMicros: number;
  payoutMicros: number;
  condition: "above" | "below";
  formatDisplay: (ticker: string, strikePriceMicros: number) => string;
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
      const cost = formatUsd(priceMicros);
      const payout = formatUsd(PRICE_UNIT);
      const strike = formatUsd(strikePriceMicros);
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
