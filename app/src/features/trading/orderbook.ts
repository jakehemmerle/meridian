import type { OrderBookLadder } from "@meridian/domain";

export interface PhoenixOrderBookEntry {
  priceInTicks: number;
  sizeInBaseLots: number;
}

export interface RawPhoenixBook {
  bids: PhoenixOrderBookEntry[];
  asks: PhoenixOrderBookEntry[];
  tickSizeInQuoteLotsPerBaseUnit: number;
  baseLotSize: number;
}

/**
 * Parse raw Phoenix order book data into a normalized OrderBookLadder.
 * Converts Phoenix tick/lot units to USDC micros.
 */
export function parsePhoenixOrderBook(raw: RawPhoenixBook): OrderBookLadder {
  const { tickSizeInQuoteLotsPerBaseUnit, baseLotSize } = raw;

  const bids = raw.bids
    .map((entry) => ({
      priceMicros: entry.priceInTicks * tickSizeInQuoteLotsPerBaseUnit,
      sizeLots: Math.floor(entry.sizeInBaseLots / baseLotSize),
    }))
    .sort((a, b) => b.priceMicros - a.priceMicros);

  const asks = raw.asks
    .map((entry) => ({
      priceMicros: entry.priceInTicks * tickSizeInQuoteLotsPerBaseUnit,
      sizeLots: Math.floor(entry.sizeInBaseLots / baseLotSize),
    }))
    .sort((a, b) => a.priceMicros - b.priceMicros);

  return { bids, asks };
}
