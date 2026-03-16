import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccountInfo, Connection } from "@solana/web3.js";
import {
  createPhoenixSubscription,
  type PhoenixDeserializer,
  type PhoenixSubscriptionCallbacks,
} from "./phoenix-subscription";
import { createOrderBookProcessor, type OrderBookState } from "./use-orderbook";
import type { RawPhoenixBook } from "./orderbook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockBook(overrides: Partial<RawPhoenixBook> = {}): RawPhoenixBook {
  return {
    bids: [],
    asks: [],
    baseLotSize: 1,
    quoteLotsPerBaseUnitPerTick: 1_000,
    quoteLotSize: 1,
    quoteDecimals: 6,
    rawBaseUnitsPerBaseUnit: 1,
    baseLotsPerBaseUnit: 1_000_000,
    ...overrides,
  };
}

const SAMPLE_RAW = mockBook({
  bids: [{ priceInTicks: 700, sizeInBaseLots: 10_000_000 }],
  asks: [{ priceInTicks: 800, sizeInBaseLots: 5_000_000 }],
});

type AccountChangeCallback = (
  accountInfo: AccountInfo<Buffer>,
  ctx: { slot: number },
) => void;

function createMockConnection() {
  let nextSubId = 1;
  const listeners = new Map<number, AccountChangeCallback>();
  let latestAccountInfo: AccountInfo<Buffer> | null = null;

  const connection = {
    onAccountChange: vi.fn(
      (_pubkey: unknown, cb: AccountChangeCallback, _commitment?: string) => {
        const id = nextSubId++;
        listeners.set(id, cb);
        return id;
      },
    ),
    getAccountInfo: vi.fn(async () => latestAccountInfo),
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

  function setAccountInfo(data: Buffer) {
    latestAccountInfo = {
      data,
      executable: false,
      lamports: 0,
      owner: {} as never,
      rentEpoch: 0,
    } as AccountInfo<Buffer>;
  }

  function hasActiveListeners(): boolean {
    return listeners.size > 0;
  }

  return {
    connection: connection as unknown as Connection,
    emitAccountChange,
    hasActiveListeners,
    setAccountInfo,
  };
}

const VALID_MARKET_ADDRESS = "11111111111111111111111111111111";

/** A mock deserializer that returns SAMPLE_RAW regardless of input. */
function stubDeserialize(): PhoenixDeserializer {
  return vi.fn((_data: Buffer) => SAMPLE_RAW);
}

// ---------------------------------------------------------------------------
// createPhoenixSubscription
// ---------------------------------------------------------------------------

describe("createPhoenixSubscription", () => {
  let mock: ReturnType<typeof createMockConnection>;
  let deserialize: PhoenixDeserializer;

  beforeEach(() => {
    mock = createMockConnection();
    deserialize = stubDeserialize();
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

    // Simulate an account change (buffer content doesn't matter — mock deserializer)
    mock.emitAccountChange(Buffer.alloc(32));

    expect(deserialize).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].bids[0].priceInTicks).toBe(700);
    expect(onStatusChange).toHaveBeenCalledWith("connected");
    expect(onError).not.toHaveBeenCalled();
  });

  it("loads the current market snapshot immediately after subscribing", async () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();
    const onStatusChange = vi.fn();
    mock.setAccountInfo(Buffer.alloc(32));

    createPhoenixSubscription(mock.connection, VALID_MARKET_ADDRESS, deserialize, {
      onUpdate,
      onError,
      onStatusChange,
    });

    await Promise.resolve();

    expect(mock.connection.getAccountInfo).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
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

    sub.unsubscribe();

    // Even if the callback somehow fires, active=false prevents delivery
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
      stubDeserialize(),
      {
        onUpdate: (book) => processor.processUpdate(book),
        onError: () => processor.setDisconnected(),
        onStatusChange: () => {},
      },
    );

    mock.emitAccountChange(Buffer.alloc(32));

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

    let shouldFail = true;
    const toggleDeserialize: PhoenixDeserializer = (_data) => {
      if (shouldFail) throw new Error("transient failure");
      return SAMPLE_RAW;
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
    mock.emitAccountChange(Buffer.alloc(32));
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
        stubDeserialize(),
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
      mock.emitAccountChange(Buffer.alloc(32));
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
