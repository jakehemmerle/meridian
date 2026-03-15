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
      const yesMintKey = market.yesMint;
      const noMintKey = market.noMint;

      const yesAta = getAssociatedTokenAddressSync(yesMintKey, publicKey);
      const noAta = getAssociatedTokenAddressSync(noMintKey, publicKey);

      let yesQuantity = 0n;
      let noQuantity = 0n;

      try {
        const yesAccount = await getAccount(connection, yesAta);
        yesQuantity = yesAccount.amount;
      } catch (err) {
        if (!(err instanceof TokenAccountNotFoundError)) throw err;
      }

      try {
        const noAccount = await getAccount(connection, noAta);
        noQuantity = noAccount.amount;
      } catch (err) {
        if (!(err instanceof TokenAccountNotFoundError)) throw err;
      }

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

    // Clean up previous subscriptions
    for (const sub of subscriptionsRef.current) {
      connection.removeAccountChangeListener(sub);
    }
    subscriptionsRef.current = [];

    fetchPosition();

    // Set up account change subscriptions for real-time updates
    if (marketAddress && publicKey) {
      const marketPda = new PublicKey(marketAddress);

      // We subscribe after initial fetch to get mint addresses
      connection.getAccountInfo(marketPda).then((info) => {
        if (!info || !mountedRef.current) return;
        const market = deserializeMeridianMarket(info.data);

        const yesAta = getAssociatedTokenAddressSync(market.yesMint, publicKey);
        const noAta = getAssociatedTokenAddressSync(market.noMint, publicKey);

        const sub1 = connection.onAccountChange(yesAta, () => {
          fetchPosition();
        });
        const sub2 = connection.onAccountChange(noAta, () => {
          fetchPosition();
        });

        subscriptionsRef.current = [sub1, sub2];
      });
    }

    return () => {
      mountedRef.current = false;
      for (const sub of subscriptionsRef.current) {
        connection.removeAccountChangeListener(sub);
      }
      subscriptionsRef.current = [];
    };
  }, [connection, marketAddress, publicKey, fetchPosition]);

  return { position, loading, refresh: fetchPosition };
}
