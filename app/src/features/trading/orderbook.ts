import type { OrderBookLadder } from "@meridian/domain";
import { deserializeMarketData } from "@ellipsis-labs/phoenix-sdk";

export interface PhoenixOrderBookEntry {
  priceInTicks: number;
  sizeInBaseLots: number;
}

export interface RawPhoenixBook {
  bids: PhoenixOrderBookEntry[];
  asks: PhoenixOrderBookEntry[];
  baseLotSize: number;
  quoteLotsPerBaseUnitPerTick: number;
  quoteLotSize: number;
  quoteDecimals: number;
  rawBaseUnitsPerBaseUnit: number;
  baseLotsPerBaseUnit: number;
}

/**
 * Deserialize a raw Solana account buffer into a RawPhoenixBook.
 *
 * Uses the Phoenix SDK's own `deserializeMarketData` to correctly parse
 * the 576-byte header, Red-Black Tree order book, and trader state.
 */
export function deserializePhoenixBook(data: Buffer): RawPhoenixBook {
  const marketData = deserializeMarketData(data);

  const bids: PhoenixOrderBookEntry[] = [];
  for (const [orderId, restingOrder] of marketData.bids) {
    bids.push({
      priceInTicks: Number(orderId.priceInTicks),
      sizeInBaseLots: Number(restingOrder.numBaseLots),
    });
  }

  const asks: PhoenixOrderBookEntry[] = [];
  for (const [orderId, restingOrder] of marketData.asks) {
    asks.push({
      priceInTicks: Number(orderId.priceInTicks),
      sizeInBaseLots: Number(restingOrder.numBaseLots),
    });
  }

  return {
    bids,
    asks,
    baseLotSize: Number(marketData.header.baseLotSize),
    quoteLotsPerBaseUnitPerTick: marketData.quoteLotsPerBaseUnitPerTick,
    quoteLotSize: Number(marketData.header.quoteLotSize),
    quoteDecimals: marketData.header.quoteParams.decimals,
    rawBaseUnitsPerBaseUnit: marketData.header.rawBaseUnitsPerBaseUnit,
    baseLotsPerBaseUnit: marketData.baseLotsPerBaseUnit,
  };
}

/**
 * Parse raw Phoenix order book data into a normalized OrderBookLadder.
 *
 * Converts Phoenix tick/lot units to USDC micros using the same formula
 * as the SDK's `levelToUiLevel`:
 *   price = priceInTicks * quoteLotsPerBaseUnitPerTick * quoteLotSize
 *           / (10^quoteDecimals * rawBaseUnitsPerBaseUnit)
 *
 * For Meridian's binary options (1 token = $1.00 USDC), this yields
 * a price in [0..1] range scaled to micros (e.g. 520000 = $0.52).
 */
export function parsePhoenixOrderBook(raw: RawPhoenixBook): OrderBookLadder {
  const {
    quoteLotsPerBaseUnitPerTick,
    quoteLotSize,
    rawBaseUnitsPerBaseUnit,
    baseLotsPerBaseUnit,
  } = raw;

  function ticksToMicros(priceInTicks: number): number {
    // ticks * quoteLotsPerTick * quoteLotSize gives quote atoms per base unit.
    // For USDC (6 decimals), quote atoms ARE micros — no extra scaling needed.
    return Math.round(
      (priceInTicks * quoteLotsPerBaseUnitPerTick * quoteLotSize) /
        rawBaseUnitsPerBaseUnit,
    );
  }

  function lotsToTokens(sizeInBaseLots: number): number {
    return (sizeInBaseLots * rawBaseUnitsPerBaseUnit) / baseLotsPerBaseUnit;
  }

  const bids = raw.bids
    .map((entry) => ({
      priceMicros: ticksToMicros(entry.priceInTicks),
      sizeLots: lotsToTokens(entry.sizeInBaseLots),
    }))
    .sort((a, b) => b.priceMicros - a.priceMicros);

  const asks = raw.asks
    .map((entry) => ({
      priceMicros: ticksToMicros(entry.priceInTicks),
      sizeLots: lotsToTokens(entry.sizeInBaseLots),
    }))
    .sort((a, b) => a.priceMicros - b.priceMicros);

  return { bids, asks };
}
