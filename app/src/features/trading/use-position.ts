"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError } from "@solana/spl-token";
import {
  deserializeMeridianMarket,
} from "../../lib/solana/market-account";
import type { UserPosition } from "./model";

export interface UseUserPositionResult {
  position: UserPosition | null;
  loading: boolean;
  refresh: () => void;
}

async function fetchTokenAmount(
  connection: Parameters<typeof getAccount>[0],
  ata: PublicKey,
): Promise<bigint> {
  try {
    const account = await getAccount(connection, ata);
    return account.amount;
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError) return 0n;
    throw err;
  }
}

export function useUserPosition(
  marketAddress: string | null,
): UseUserPositionResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const subscriptionsRef = useRef<number[]>([]);

  const fetchPosition = useCallback(async () => {
    if (!marketAddress || !publicKey) {
      setPosition(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const marketPda = new PublicKey(marketAddress);
      const accountInfo = await connection.getAccountInfo(marketPda);
      if (!accountInfo) {
        setPosition(null);
        return;
      }

      const market = deserializeMeridianMarket(accountInfo.data);
      const yesAta = getAssociatedTokenAddressSync(market.yesMint, publicKey);
      const noAta = getAssociatedTokenAddressSync(market.noMint, publicKey);

      const [yesQuantity, noQuantity] = await Promise.all([
        fetchTokenAmount(connection, yesAta),
        fetchTokenAmount(connection, noAta),
      ]);

      if (mountedRef.current) {
        setPosition({ yesQuantity, noQuantity });
      }
    } catch {
      if (mountedRef.current) {
        setPosition(null);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [connection, marketAddress, publicKey]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    // Clean up previous subscriptions
    for (const sub of subscriptionsRef.current) {
      connection.removeAccountChangeListener(sub);
    }
    subscriptionsRef.current = [];

    // Fetch position and set up subscriptions using the same RPC result
    if (marketAddress && publicKey) {
      const marketPda = new PublicKey(marketAddress);

      connection.getAccountInfo(marketPda).then((info) => {
        if (!info || !mountedRef.current || cancelled) return;
        const market = deserializeMeridianMarket(info.data);

        const yesAta = getAssociatedTokenAddressSync(market.yesMint, publicKey);
        const noAta = getAssociatedTokenAddressSync(market.noMint, publicKey);

        // Fetch initial position from the already-resolved market data
        Promise.all([
          fetchTokenAmount(connection, yesAta),
          fetchTokenAmount(connection, noAta),
        ]).then(([yesQuantity, noQuantity]) => {
          if (mountedRef.current && !cancelled) {
            setPosition({ yesQuantity, noQuantity });
          }
        }).catch(() => {
          if (mountedRef.current && !cancelled) {
            setPosition(null);
          }
        });

        // Subscribe for real-time updates
        const sub1 = connection.onAccountChange(yesAta, () => {
          fetchPosition();
        });
        const sub2 = connection.onAccountChange(noAta, () => {
          fetchPosition();
        });

        if (cancelled) {
          // Cleanup ran before subscriptions were created — unsubscribe immediately
          connection.removeAccountChangeListener(sub1);
          connection.removeAccountChangeListener(sub2);
        } else {
          subscriptionsRef.current = [sub1, sub2];
        }
      });
    } else {
      setPosition(null);
      setLoading(false);
    }

    return () => {
      mountedRef.current = false;
      cancelled = true;
      for (const sub of subscriptionsRef.current) {
        connection.removeAccountChangeListener(sub);
      }
      subscriptionsRef.current = [];
    };
  }, [connection, marketAddress, publicKey, fetchPosition]);

  return { position, loading, refresh: fetchPosition };
}
