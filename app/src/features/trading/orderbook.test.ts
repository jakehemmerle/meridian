import { describe, it, expect } from "vitest";
import {
  parsePhoenixOrderBook,
  type RawPhoenixBook,
} from "./orderbook";
import {
  createOrderBookProcessor,
  type OrderBookState,
} from "./use-orderbook";

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

// --- Order book processor tests (extracted hook logic) ---

const SAMPLE_RAW: RawPhoenixBook = {
  bids: [{ priceInTicks: 700, sizeInBaseLots: 10_000_000 }],
  asks: [{ priceInTicks: 800, sizeInBaseLots: 5_000_000 }],
  tickSizeInQuoteLotsPerBaseUnit: 1000,
  baseLotSize: 1_000_000,
};

describe("createOrderBookProcessor", () => {
  it("initial state: ladder is null, status is connecting", () => {
    const processor = createOrderBookProcessor(5000);
    const state = processor.getState();

    expect(state.yesLadder).toBeNull();
    expect(state.noLadder).toBeNull();
    expect(state.status).toBe("connecting");
  });

  it("processUpdate updates ladder and status to connected", () => {
    const processor = createOrderBookProcessor(5000);
    processor.processUpdate(SAMPLE_RAW);
    const state = processor.getState();

    expect(state.status).toBe("connected");
    expect(state.yesLadder).not.toBeNull();
    expect(state.yesLadder!.bids).toHaveLength(1);
    expect(state.yesLadder!.bids[0].priceMicros).toBe(700_000);
    expect(state.noLadder).not.toBeNull();
    // No-side: Yes ask 800_000 → No bid 200_000
    expect(state.noLadder!.bids[0].priceMicros).toBe(200_000);
  });

  it("no update within threshold transitions status to stale", () => {
    let fakeNow = 1000;
    const processor = createOrderBookProcessor(5000, () => fakeNow);

    processor.processUpdate(SAMPLE_RAW);
    expect(processor.getState().status).toBe("connected");

    // Advance past staleness threshold
    fakeNow = 7000;
    processor.checkStaleness();

    expect(processor.getState().status).toBe("stale");
  });

  it("cleanup is callable", () => {
    const cleanupCalled: number[] = [];
    const processor = createOrderBookProcessor(5000);
    processor.addCleanup(() => cleanupCalled.push(1));
    processor.cleanup();
    expect(cleanupCalled).toEqual([1]);
  });
});
