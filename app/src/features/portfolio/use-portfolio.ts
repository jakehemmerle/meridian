"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import {
  deserializeMeridianMarket,
  MERIDIAN_MARKET_ACCOUNT_SIZE,
} from "../../lib/solana/market-account";
import type { PortfolioPosition } from "./model";

const PROGRAM_ID = new PublicKey(
  "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

const POLL_INTERVAL_MS = 15_000;

export interface UsePortfolioPositionsResult {
  positions: PortfolioPosition[];
  loading: boolean;
}

export function usePortfolioPositions(): UsePortfolioPositionsResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchPositions = useCallback(async () => {
    if (!publicKey) {
      setPositions([]);
      setLoading(false);
      return;
    }

    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: MERIDIAN_MARKET_ACCOUNT_SIZE }],
      });

      const result: PortfolioPosition[] = [];

      for (const { pubkey, account } of accounts) {
        const market = deserializeMeridianMarket(account.data);
        const marketId = pubkey.toBase58();

        const yesAta = getAssociatedTokenAddressSync(market.yesMint, publicKey);
        const noAta = getAssociatedTokenAddressSync(market.noMint, publicKey);

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

        if (yesQuantity > 0n) {
          result.push({
            marketId,
            ticker: market.ticker,
            side: "yes",
            quantity: yesQuantity,
            averageEntryPriceMicros: 0n, // Entry tracking requires tx history parsing
            markPriceMicros: null,
          });
        }

        if (noQuantity > 0n) {
          result.push({
            marketId,
            ticker: market.ticker,
            side: "no",
            quantity: noQuantity,
            averageEntryPriceMicros: 0n,
            markPriceMicros: null,
          });
        }
      }

      if (mountedRef.current) {
        setPositions(result);
      }
    } catch {
      // Silently handle errors on poll
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPositions();

    const intervalId = setInterval(fetchPositions, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchPositions]);

  return { positions, loading };
}
