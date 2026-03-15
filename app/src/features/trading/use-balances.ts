"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { readPublicMeridianEnv } from "../../lib/env/public";
import type { UserPosition } from "./model";

export interface UserBalances {
  usdc: bigint;
  yes: bigint;
  no: bigint;
}

export function useBalances(
  yesMint: PublicKey | null,
  noMint: PublicKey | null,
  refreshTrigger: number = 0,
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balances, setBalances] = useState<UserBalances | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey || !yesMint || !noMint) {
      setBalances(null);
      return;
    }
    const usdcMint = new PublicKey(readPublicMeridianEnv().usdcMint);

    const [usdcAta, yesAta, noAta] = await Promise.all([
      getAssociatedTokenAddress(usdcMint, publicKey),
      getAssociatedTokenAddress(yesMint, publicKey),
      getAssociatedTokenAddress(noMint, publicKey),
    ]);

    const readBalance = async (ata: PublicKey): Promise<bigint> => {
      try {
        const account = await getAccount(connection, ata);
        return account.amount;
      } catch {
        return 0n;
      }
    };

    const [usdc, yes, no] = await Promise.all([
      readBalance(usdcAta),
      readBalance(yesAta),
      readBalance(noAta),
    ]);

    setBalances({ usdc, yes, no });
  }, [publicKey, yesMint, noMint, connection]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh, refreshTrigger]);

  const position: UserPosition | null = balances
    ? { yesQuantity: balances.yes, noQuantity: balances.no }
    : null;

  return { balances, position, refresh };
}
