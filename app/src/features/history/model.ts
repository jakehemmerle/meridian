export interface TradeEvent {
  type: "trade";
  ticker: string;
  side: "buy-yes" | "buy-no" | "sell-yes" | "sell-no";
  quantity: number;
  priceMicros: number;
  timestampMs: number;
}

export interface RedeemEvent {
  type: "redeem";
  ticker: string;
  payoutMicros: number;
  quantity: number;
  timestampMs: number;
}

export type HistoryEvent = TradeEvent | RedeemEvent;
