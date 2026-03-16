import type { Connection, AccountInfo, Commitment } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import type { RawPhoenixBook } from "./orderbook";

export type PhoenixDeserializer = (data: Buffer) => RawPhoenixBook;

export interface PhoenixSubscriptionCallbacks {
  onUpdate: (book: RawPhoenixBook) => void;
  onError: (error: Error) => void;
  onStatusChange: (status: "connected" | "disconnected") => void;
}

export interface PhoenixSubscription {
  unsubscribe: () => void;
}

/**
 * Create a WebSocket subscription to a Phoenix market account.
 *
 * Subscribes via `connection.onAccountChange`, deserializes the raw
 * `AccountInfo<Buffer>` into `RawPhoenixBook`, and feeds it to the
 * provided callbacks. Deserialization errors are reported via `onError`
 * and transition status to "disconnected".
 */
export function createPhoenixSubscription(
  connection: Connection,
  marketAddress: string,
  deserialize: PhoenixDeserializer,
  callbacks: PhoenixSubscriptionCallbacks,
  commitment: Commitment = "confirmed",
): PhoenixSubscription {
  let active = true;

  const pubkey = new PublicKey(marketAddress);

  function deliverAccountData(accountInfo: AccountInfo<Buffer>) {
    try {
      const book = deserialize(accountInfo.data);
      callbacks.onStatusChange("connected");
      callbacks.onUpdate(book);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      callbacks.onStatusChange("disconnected");
    }
  }

  const subId = connection.onAccountChange(
    pubkey,
    (accountInfo: AccountInfo<Buffer>) => {
      if (!active) return;
      deliverAccountData(accountInfo);
    },
    commitment,
  );

  void connection
    .getAccountInfo(pubkey, commitment)
    .then((accountInfo) => {
      if (!active || !accountInfo) return;
      deliverAccountData(accountInfo as AccountInfo<Buffer>);
    })
    .catch((err) => {
      if (!active) return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      callbacks.onStatusChange("disconnected");
    });

  return {
    unsubscribe: () => {
      active = false;
      connection.removeAccountChangeListener(subId);
    },
  };
}
