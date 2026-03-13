import { describe, it, expect } from "vitest";
import {
  parsePhoenixOrderBook,
  type RawPhoenixBook,
} from "./orderbook";

describe("parsePhoenixOrderBook", () => {
  it("parses mock Phoenix bid/ask entries into OrderBookLadder", () => {
    const raw: RawPhoenixBook = {
      bids: [
        { priceInTicks: 700, sizeInBaseLots: 10_000_000 },
        { priceInTicks: 600, sizeInBaseLots: 20_000_000 },
      ],
      asks: [
        { priceInTicks: 800, sizeInBaseLots: 5_000_000 },
        { priceInTicks: 900, sizeInBaseLots: 15_000_000 },
      ],
      tickSizeInQuoteLotsPerBaseUnit: 1000,
      baseLotSize: 1_000_000,
    };

    const ladder = parsePhoenixOrderBook(raw);

    expect(ladder.bids).toHaveLength(2);
    expect(ladder.asks).toHaveLength(2);

    // Bids should be sorted descending by price
    expect(ladder.bids[0].priceMicros).toBeGreaterThanOrEqual(ladder.bids[1].priceMicros);
    // Asks should be sorted ascending by price
    expect(ladder.asks[0].priceMicros).toBeLessThanOrEqual(ladder.asks[1].priceMicros);
  });

  it("returns empty ladder for empty book", () => {
    const raw: RawPhoenixBook = {
      bids: [],
      asks: [],
      tickSizeInQuoteLotsPerBaseUnit: 1000,
      baseLotSize: 1_000_000,
    };

    const ladder = parsePhoenixOrderBook(raw);
    expect(ladder.bids).toHaveLength(0);
    expect(ladder.asks).toHaveLength(0);
  });

  it("converts Phoenix tick/lot units to USDC micros correctly", () => {
    // With tickSize = 1000 quote lots per base unit per tick:
    // price in USDC micros = priceInTicks * tickSizeInQuoteLotsPerBaseUnit
    // sizeLots = sizeInBaseLots (lot size = 1_000_000 = 1 base unit)
    const raw: RawPhoenixBook = {
      bids: [{ priceInTicks: 500, sizeInBaseLots: 3_000_000 }],
      asks: [],
      tickSizeInQuoteLotsPerBaseUnit: 1000,
      baseLotSize: 1_000_000,
    };

    const ladder = parsePhoenixOrderBook(raw);

    // 500 ticks * 1000 quote lots/tick = 500_000 USDC micros ($0.50)
    expect(ladder.bids[0].priceMicros).toBe(500_000);
    // 3_000_000 base lots / 1_000_000 lot size = 3 lots
    expect(ladder.bids[0].sizeLots).toBe(3);
  });
});
