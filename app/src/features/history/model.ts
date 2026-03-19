export interface TradeEvent {
  type: "trade";
  ticker: string;
  marketId: string;
  side: "buy-yes" | "buy-no" | "sell-yes" | "sell-no";
  quantity: number;
  priceMicros: number;
  timestampMs: number;
  signature: string;
}

export interface RedeemEvent {
  type: "redeem";
  ticker: string;
  marketId: string;
  payoutMicros: number;
  quantity: number;
  timestampMs: number;
  signature: string;
}

export type HistoryEvent = TradeEvent | RedeemEvent;
