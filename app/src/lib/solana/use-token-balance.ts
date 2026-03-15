import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export interface TokenBalances {
  usdc: bigint;
  yes: bigint;
  no: bigint;
  refresh: () => void;
}

export function useTokenBalances(
  usdcMint: PublicKey | null,
  yesMint: PublicKey | null,
  noMint: PublicKey | null,
): TokenBalances {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [usdc, setUsdc] = useState(0n);
  const [yes, setYes] = useState(0n);
  const [no, setNo] = useState(0n);

  const refresh = useCallback(async () => {
    if (!publicKey || !usdcMint || !yesMint || !noMint) return;

    try {
      const usdcAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
      const yesAta = getAssociatedTokenAddressSync(yesMint, publicKey);
      const noAta = getAssociatedTokenAddressSync(noMint, publicKey);

      const [usdcInfo, yesInfo, noInfo] = await Promise.all([
        connection.getTokenAccountBalance(usdcAta).catch(() => null),
        connection.getTokenAccountBalance(yesAta).catch(() => null),
        connection.getTokenAccountBalance(noAta).catch(() => null),
      ]);

      setUsdc(BigInt(usdcInfo?.value.amount ?? "0"));
      setYes(BigInt(yesInfo?.value.amount ?? "0"));
      setNo(BigInt(noInfo?.value.amount ?? "0"));
    } catch {
      // balances stay at 0
    }
  }, [connection, publicKey, usdcMint, yesMint, noMint]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { usdc, yes, no, refresh };
}
