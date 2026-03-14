import { useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import type { OrderBookLadder } from "@meridian/domain";
import { invertYesLadderToNo } from "@meridian/domain";
import {
  parsePhoenixOrderBook,
  deserializePhoenixBook,
  type RawPhoenixBook,
} from "./orderbook";
import {
  createPhoenixSubscription,
  type PhoenixDeserializer,
} from "./phoenix-subscription";

export type OrderBookStatus = "connecting" | "connected" | "stale" | "disconnected";

export interface OrderBookState {
  yesLadder: OrderBookLadder | null;
  noLadder: OrderBookLadder | null;
  status: OrderBookStatus;
}

const DEFAULT_STALENESS_THRESHOLD_MS = 10_000;

/**
 * Testable core logic for order book state management.
 * Extracted from the React hook for unit testing without jsdom/React overhead.
 */
export function createOrderBookProcessor(
  stalenessThresholdMs: number,
  now: () => number = Date.now,
) {
  let state: OrderBookState = {
    yesLadder: null,
    noLadder: null,
    status: "connecting",
  };
  let lastUpdateTime = 0;
  let onChange: ((s: OrderBookState) => void) | null = null;
  const cleanups: (() => void)[] = [];

  function setState(newState: OrderBookState) {
    state = newState;
    onChange?.(newState);
  }

  return {
    getState: () => state,
    setOnChange: (cb: (s: OrderBookState) => void) => {
      onChange = cb;
    },
    processUpdate: (raw: RawPhoenixBook) => {
      const yesLadder = parsePhoenixOrderBook(raw);
      const noLadder = invertYesLadderToNo(yesLadder);
      lastUpdateTime = now();
      setState({ yesLadder, noLadder, status: "connected" });
    },
    setDisconnected: () => {
      if (state.status !== "disconnected") {
        setState({ ...state, status: "disconnected" });
      }
    },
    checkStaleness: () => {
      if (lastUpdateTime > 0 && now() - lastUpdateTime > stalenessThresholdMs) {
        if (state.status !== "stale") {
          setState({ ...state, status: "stale" });
        }
      }
    },
    addCleanup: (fn: () => void) => {
      cleanups.push(fn);
    },
    cleanup: () => {
      for (const fn of cleanups) fn();
    },
  };
}

export function useOrderBook(
  marketAddress: string | null,
  stalenessThresholdMs = DEFAULT_STALENESS_THRESHOLD_MS,
  deserialize: PhoenixDeserializer = deserializePhoenixBook,
): OrderBookState {
  const { connection } = useConnection();
  const [state, setState] = useState<OrderBookState>({
    yesLadder: null,
    noLadder: null,
    status: marketAddress ? "connecting" : "disconnected",
  });

  const processorRef = useRef(createOrderBookProcessor(stalenessThresholdMs));

  useEffect(() => {
    if (!marketAddress) {
      setState({ yesLadder: null, noLadder: null, status: "disconnected" });
      return;
    }

    const processor = createOrderBookProcessor(stalenessThresholdMs);
    processorRef.current = processor;
    processor.setOnChange(setState);

    const subscription = createPhoenixSubscription(
      connection,
      marketAddress,
      deserialize,
      {
        onUpdate: (book) => processor.processUpdate(book),
        onError: () => processor.setDisconnected(),
        onStatusChange: () => {
          // Status is managed by the processor via processUpdate/setDisconnected
        },
      },
    );

    const intervalId = setInterval(() => {
      processor.checkStaleness();
    }, 1000);

    processor.addCleanup(() => {
      subscription.unsubscribe();
      clearInterval(intervalId);
    });

    return () => {
      processor.cleanup();
    };
  }, [marketAddress, connection, stalenessThresholdMs, deserialize]);

  return state;
}
