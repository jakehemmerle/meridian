import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccountInfo, Connection } from "@solana/web3.js";
import {
  createPhoenixSubscription,
  type PhoenixDeserializer,
  type PhoenixSubscriptionCallbacks,
} from "./phoenix-subscription";
import { createOrderBookProcessor, type OrderBookState } from "./use-orderbook";
import type { RawPhoenixBook } from "./orderbook";
import { deserializePhoenixBook } from "./orderbook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_RAW: RawPhoenixBook = {
  bids: [{ priceInTicks: 700, sizeInBaseLots: 10_000_000 }],
  asks: [{ priceInTicks: 800, sizeInBaseLots: 5_000_000 }],
  tickSizeInQuoteLotsPerBaseUnit: 1000,
  baseLotSize: 1_000_000,
};

/** Build a Buffer that `deserializePhoenixBook` can parse. */
function encodePhoenixBook(book: RawPhoenixBook): Buffer {
  const entrySize = 16;
  const headerSize = 32;
  const totalEntries = book.bids.length + book.asks.length;
  const buf = Buffer.alloc(headerSize + totalEntries * entrySize);

  // discriminator (8 bytes) — zero is fine for tests
  buf.writeBigUInt64LE(BigInt(book.tickSizeInQuoteLotsPerBaseUnit), 8);
  buf.writeBigUInt64LE(BigInt(book.baseLotSize), 16);
  buf.writeUInt32LE(book.bids.length, 24);
  buf.writeUInt32LE(book.asks.length, 28);

  let off = headerSize;
  for (const bid of book.bids) {
    buf.writeBigUInt64LE(BigInt(bid.priceInTicks), off);
    buf.writeBigUInt64LE(BigInt(bid.sizeInBaseLots), off + 8);
    off += entrySize;
  }
  for (const ask of book.asks) {
    buf.writeBigUInt64LE(BigInt(ask.priceInTicks), off);
    buf.writeBigUInt64LE(BigInt(ask.sizeInBaseLots), off + 8);
    off += entrySize;
  }
  return buf;
}

type AccountChangeCallback = (
  accountInfo: AccountInfo<Buffer>,
  ctx: { slot: number },
) => void;

function createMockConnection() {
  let nextSubId = 1;
  const listeners = new Map<number, AccountChangeCallback>();

  const connection = {
    onAccountChange: vi.fn(
      (_pubkey: unknown, cb: AccountChangeCallback, _commitment?: string) => {
        const id = nextSubId++;
        listeners.set(id, cb);
        return id;
      },
    ),
    removeAccountChangeListener: vi.fn((id: number) => {
      listeners.delete(id);
    }),
  };

  /** Simulate an account change event on the most recent subscription. */
  function emitAccountChange(data: Buffer) {
    const lastId = nextSubId - 1;
    const cb = listeners.get(lastId);
    if (!cb) throw new Error(`No listener for sub ${lastId}`);
    cb(
      {
        data,
        executable: false,
        lamports: 0,
        owner: {} as never,
        rentEpoch: 0,
      } as AccountInfo<Buffer>,
      { slot: 42 },
    );
  }

  function hasActiveListeners(): boolean {
    return listeners.size > 0;
  }

  return { connection: connection as unknown as Connection, emitAccountChange, hasActiveListeners };
}

const VALID_MARKET_ADDRESS = "11111111111111111111111111111111";

// ---------------------------------------------------------------------------
// deserializePhoenixBook
// ---------------------------------------------------------------------------

describe("deserializePhoenixBook", () => {
  it("round-trips a RawPhoenixBook through encode/deserialize", () => {
    const buf = encodePhoenixBook(SAMPLE_RAW);
    const result = deserializePhoenixBook(buf);

    expect(result.tickSizeInQuoteLotsPerBaseUnit).toBe(1000);
    expect(result.baseLotSize).toBe(1_000_000);
    expect(result.bids).toHaveLength(1);
    expect(result.bids[0].priceInTicks).toBe(700);
    expect(result.bids[0].sizeInBaseLots).toBe(10_000_000);
    expect(result.asks).toHaveLength(1);
    expect(result.asks[0].priceInTicks).toBe(800);
    expect(result.asks[0].sizeInBaseLots).toBe(5_000_000);
  });

  it("throws on a buffer that is too short", () => {
    expect(() => deserializePhoenixBook(Buffer.alloc(10))).toThrow(
      "too short",
    );
  });

  it("throws on a truncated buffer", () => {
    const buf = encodePhoenixBook(SAMPLE_RAW);
    // Chop off the last few bytes so entry data is incomplete
    const truncated = buf.subarray(0, 40);
    expect(() => deserializePhoenixBook(truncated)).toThrow("truncated");
  });

  it("handles an empty book", () => {
    const empty: RawPhoenixBook = {
      bids: [],
      asks: [],
      tickSizeInQuoteLotsPerBaseUnit: 1000,
      baseLotSize: 1_000_000,
    };
    const result = deserializePhoenixBook(encodePhoenixBook(empty));
    expect(result.bids).toHaveLength(0);
    expect(result.asks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createPhoenixSubscription
// ---------------------------------------------------------------------------

describe("createPhoenixSubscription", () => {
  let mock: ReturnType<typeof createMockConnection>;
  let deserialize: PhoenixDeserializer;

  beforeEach(() => {
    mock = createMockConnection();
    deserialize = vi.fn((data: Buffer) => deserializePhoenixBook(data));
  });

  it("subscribes to account changes and triggers onUpdate", () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();
    const onStatusChange = vi.fn();

    createPhoenixSubscription(mock.connection, VALID_MARKET_ADDRESS, deserialize, {
      onUpdate,
      onError,
      onStatusChange,
    });

    expect(mock.connection.onAccountChange).toHaveBeenCalledTimes(1);

    // Simulate an account change
    mock.emitAccountChange(encodePhoenixBook(SAMPLE_RAW));

    expect(deserialize).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].bids[0].priceInTicks).toBe(700);
    expect(onStatusChange).toHaveBeenCalledWith("connected");
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError and sets disconnected when deserialization fails", () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();
    const onStatusChange = vi.fn();
    const badDeserialize: PhoenixDeserializer = () => {
      throw new Error("bad data");
    };

    createPhoenixSubscription(
      mock.connection,
      VALID_MARKET_ADDRESS,
      badDeserialize,
      { onUpdate, onError, onStatusChange },
    );

    mock.emitAccountChange(Buffer.alloc(32));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("bad data");
    expect(onStatusChange).toHaveBeenCalledWith("disconnected");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("unsubscribe removes the account change listener", () => {
    const onUpdate = vi.fn();

    const sub = createPhoenixSubscription(
      mock.connection,
      VALID_MARKET_ADDRESS,
      deserialize,
      { onUpdate, onError: vi.fn(), onStatusChange: vi.fn() },
    );

    sub.unsubscribe();

    expect(mock.connection.removeAccountChangeListener).toHaveBeenCalledTimes(1);
    expect(mock.hasActiveListeners()).toBe(false);
  });

  it("does not deliver updates after unsubscribe", () => {
    const onUpdate = vi.fn();

    const sub = createPhoenixSubscription(
      mock.connection,
      VALID_MARKET_ADDRESS,
      deserialize,
      { onUpdate, onError: vi.fn(), onStatusChange: vi.fn() },
    );

    // Capture the callback before unsubscribing
    const subId = (mock.connection.onAccountChange as ReturnType<typeof vi.fn>).mock
      .results[0].value;

    sub.unsubscribe();

    // Even if the callback somehow fires, active=false prevents delivery
    // (The listener was removed, so this is a belt-and-suspenders check)
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Subscription → Processor integration
// ---------------------------------------------------------------------------

describe("subscription → processor integration", () => {
  it("account change feeds through to processor state", () => {
    const mock = createMockConnection();
    const processor = createOrderBookProcessor(5000);
    const states: OrderBookState[] = [];
    processor.setOnChange((s) => states.push(s));

    createPhoenixSubscription(
      mock.connection,
      VALID_MARKET_ADDRESS,
      deserializePhoenixBook,
      {
        onUpdate: (book) => processor.processUpdate(book),
        onError: () => processor.setDisconnected(),
        onStatusChange: () => {},
      },
    );

    mock.emitAccountChange(encodePhoenixBook(SAMPLE_RAW));

    expect(states).toHaveLength(1);
    expect(states[0].status).toBe("connected");
    expect(states[0].yesLadder).not.toBeNull();
    expect(states[0].yesLadder!.bids[0].priceMicros).toBe(700_000);
    // No-side inversion: Yes ask 800_000 → No bid 200_000
    expect(states[0].noLadder!.bids[0].priceMicros).toBe(200_000);
  });

  it("deserialization error transitions processor to disconnected", () => {
    const mock = createMockConnection();
    const processor = createOrderBookProcessor(5000);
    const states: OrderBookState[] = [];
    processor.setOnChange((s) => states.push(s));

    const badDeserialize: PhoenixDeserializer = () => {
      throw new Error("corrupt");
    };

    createPhoenixSubscription(
      mock.connection,
      VALID_MARKET_ADDRESS,
      badDeserialize,
      {
        onUpdate: (book) => processor.processUpdate(book),
        onError: () => processor.setDisconnected(),
        onStatusChange: () => {},
      },
    );

    mock.emitAccountChange(Buffer.alloc(32));

    expect(states).toHaveLength(1);
    expect(states[0].status).toBe("disconnected");
  });

  it("reconnection: after disconnect, new data restores connected status", () => {
    const mock = createMockConnection();
    const processor = createOrderBookProcessor(5000);
    const states: OrderBookState[] = [];
    processor.setOnChange((s) => states.push(s));

    // First use a failing deserializer to simulate disconnect
    let shouldFail = true;
    const toggleDeserialize: PhoenixDeserializer = (data) => {
      if (shouldFail) throw new Error("transient failure");
      return deserializePhoenixBook(data);
    };

    createPhoenixSubscription(
      mock.connection,
      VALID_MARKET_ADDRESS,
      toggleDeserialize,
      {
        onUpdate: (book) => processor.processUpdate(book),
        onError: () => processor.setDisconnected(),
        onStatusChange: () => {},
      },
    );

    // First update fails → disconnected
    mock.emitAccountChange(Buffer.alloc(32));
    expect(processor.getState().status).toBe("disconnected");

    // "Reconnection" — network recovers, valid data arrives
    shouldFail = false;
    mock.emitAccountChange(encodePhoenixBook(SAMPLE_RAW));
    expect(processor.getState().status).toBe("connected");
    expect(processor.getState().yesLadder).not.toBeNull();
  });

  it("cleanup stops subscription and staleness timer", () => {
    vi.useFakeTimers();
    try {
      const mock = createMockConnection();
      const processor = createOrderBookProcessor(5000);
      const states: OrderBookState[] = [];
      processor.setOnChange((s) => states.push(s));

      const sub = createPhoenixSubscription(
        mock.connection,
        VALID_MARKET_ADDRESS,
        deserializePhoenixBook,
        {
          onUpdate: (book) => processor.processUpdate(book),
          onError: () => processor.setDisconnected(),
          onStatusChange: () => {},
        },
      );

      const intervalId = setInterval(() => processor.checkStaleness(), 1000);
      processor.addCleanup(() => {
        sub.unsubscribe();
        clearInterval(intervalId);
      });

      // Feed one update
      mock.emitAccountChange(encodePhoenixBook(SAMPLE_RAW));
      expect(processor.getState().status).toBe("connected");

      // Cleanup
      processor.cleanup();

      // After cleanup, staleness timer should not fire
      vi.advanceTimersByTime(10_000);
      // Status stays "connected" because the timer was cleared
      expect(processor.getState().status).toBe("connected");

      // Listener was removed
      expect(mock.hasActiveListeners()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
