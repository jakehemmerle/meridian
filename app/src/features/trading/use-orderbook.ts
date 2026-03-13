import { useEffect, useRef, useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import type { OrderBookLadder } from "@meridian/domain";
import { invertYesLadderToNo } from "@meridian/domain";
import { parsePhoenixOrderBook, type RawPhoenixBook } from "./orderbook";

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

    const pubkey = new PublicKey(marketAddress);
    const subId = connection.onAccountChange(pubkey, (accountInfo) => {
      processor.processUpdate(accountInfo as unknown as RawPhoenixBook);
    });

    const intervalId = setInterval(() => {
      processor.checkStaleness();
    }, 1000);

    return () => {
      connection.removeAccountChangeListener(subId);
      clearInterval(intervalId);
      processor.cleanup();
    };
  }, [marketAddress, connection, stalenessThresholdMs]);

  return state;
}
