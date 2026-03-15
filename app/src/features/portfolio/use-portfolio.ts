"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  deserializeMeridianMarket,
  MERIDIAN_MARKET_ACCOUNT_SIZE,
} from "../../lib/solana/market-account";
import { MERIDIAN_PROGRAM_ID } from "../../lib/solana/program";
import type { PortfolioPosition } from "./model";

const POLL_INTERVAL_MS = 15_000;

export interface UsePortfolioPositionsResult {
  positions: PortfolioPosition[];
  loading: boolean;
}

async function getAtaBalance(connection: Connection, ata: PublicKey): Promise<bigint> {
  const info = await connection.getTokenAccountBalance(ata).catch(() => null);
  return BigInt(info?.value.amount ?? "0");
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
      const accounts = await connection.getProgramAccounts(MERIDIAN_PROGRAM_ID, {
        filters: [{ dataSize: MERIDIAN_MARKET_ACCOUNT_SIZE }],
      });

      const result: PortfolioPosition[] = [];

      for (const { pubkey, account } of accounts) {
        const market = deserializeMeridianMarket(account.data);
        const marketId = pubkey.toBase58();

        const yesAta = getAssociatedTokenAddressSync(market.yesMint, publicKey);
        const noAta = getAssociatedTokenAddressSync(market.noMint, publicKey);

        const [yesQuantity, noQuantity] = await Promise.all([
          getAtaBalance(connection, yesAta),
          getAtaBalance(connection, noAta),
        ]);

        if (yesQuantity > 0n) {
          result.push({
            marketId,
            ticker: market.ticker,
            side: "yes",
            quantity: yesQuantity,
            averageEntryPriceMicros: 0n,
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
