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
 * Deserialize a raw Solana account buffer into a RawPhoenixBook.
 *
 * Phoenix market accounts store the order book as a header followed by
 * packed bid/ask entries. This extracts the tick/lot parameters from the
 * header and walks the bid and ask arrays.
 *
 * Layout (simplified):
 *   [0..8]   discriminator
 *   [8..16]  tickSizeInQuoteLotsPerBaseUnit (u64 LE)
 *   [16..24] baseLotSize (u64 LE)
 *   [24..28] numBids (u32 LE)
 *   [28..32] numAsks (u32 LE)
 *   [32..]   entries: 16 bytes each (u64 priceInTicks, u64 sizeInBaseLots)
 */
export function deserializePhoenixBook(data: Buffer): RawPhoenixBook {
  if (data.length < 32) {
    throw new Error(`Phoenix account data too short: ${data.length} bytes`);
  }

  const tickSize = Number(data.readBigUInt64LE(8));
  const baseLotSize = Number(data.readBigUInt64LE(16));
  const numBids = data.readUInt32LE(24);
  const numAsks = data.readUInt32LE(28);

  const entrySize = 16;
  const entriesStart = 32;
  const expectedLen = entriesStart + (numBids + numAsks) * entrySize;

  if (data.length < expectedLen) {
    throw new Error(
      `Phoenix account data truncated: got ${data.length}, need ${expectedLen}`,
    );
  }

  const bids: PhoenixOrderBookEntry[] = [];
  for (let i = 0; i < numBids; i++) {
    const off = entriesStart + i * entrySize;
    bids.push({
      priceInTicks: Number(data.readBigUInt64LE(off)),
      sizeInBaseLots: Number(data.readBigUInt64LE(off + 8)),
    });
  }

  const asks: PhoenixOrderBookEntry[] = [];
  for (let i = 0; i < numAsks; i++) {
    const off = entriesStart + (numBids + i) * entrySize;
    asks.push({
      priceInTicks: Number(data.readBigUInt64LE(off)),
      sizeInBaseLots: Number(data.readBigUInt64LE(off + 8)),
    });
  }

  return {
    bids,
    asks,
    tickSizeInQuoteLotsPerBaseUnit: tickSize,
    baseLotSize,
  };
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
