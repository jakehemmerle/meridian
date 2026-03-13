export interface OrderBookLevel {
  priceMicros: number;
  sizeLots: number;
}

export interface OrderBookLadder {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

const PRICE_UNIT = 1_000_000;

/**
 * Invert a Yes-side order book ladder to derive the No-side.
 * Yes asks become No bids, Yes bids become No asks.
 * Prices are inverted: noPrice = 1_000_000 - yesPrice.
 * Bids sorted descending, asks sorted ascending by price.
 */
export function invertYesLadderToNo(yesLadder: OrderBookLadder): OrderBookLadder {
  const noBids = yesLadder.asks
    .map((level) => ({
      priceMicros: PRICE_UNIT - level.priceMicros,
      sizeLots: level.sizeLots,
    }))
    .sort((a, b) => b.priceMicros - a.priceMicros);

  const noAsks = yesLadder.bids
    .map((level) => ({
      priceMicros: PRICE_UNIT - level.priceMicros,
      sizeLots: level.sizeLots,
    }))
    .sort((a, b) => a.priceMicros - b.priceMicros);

  return { bids: noBids, asks: noAsks };
}
