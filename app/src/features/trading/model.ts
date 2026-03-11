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
