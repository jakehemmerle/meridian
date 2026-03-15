import { useState, useCallback } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

import { getMeridianProgram } from "../../lib/solana/program";

export type RedeemStatus = "idle" | "signing" | "confirming" | "confirmed" | "error";

export interface RedeemExecution {
  redeem: (pairs: bigint) => Promise<string>;
  status: RedeemStatus;
  error: string | null;
}

export interface RedeemMarketAccounts {
  marketPda: PublicKey;
  configPda: PublicKey;
  vaultPda: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  usdcMint: PublicKey;
}

export function useRedeem(marketAccounts: RedeemMarketAccounts | null): RedeemExecution {
  const { connection } = useConnection();
  const { sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [status, setStatus] = useState<RedeemStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const redeem = useCallback(
    async (pairs: bigint): Promise<string> => {
      if (!anchorWallet || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      if (!marketAccounts) {
        throw new Error("Market accounts not loaded");
      }

      setStatus("signing");
      setError(null);

      try {
        const program = getMeridianProgram(connection, anchorWallet);
        const user = anchorWallet.publicKey;

        const { marketPda, usdcMint, yesMint, noMint } = marketAccounts;

        const userUsdc = getAssociatedTokenAddressSync(usdcMint, user);
        const userYes = getAssociatedTokenAddressSync(yesMint, user);
        const userNo = getAssociatedTokenAddressSync(noMint, user);

        const ix = await program.methods
          .redeem(new BN(pairs.toString()))
          .accountsPartial({
            user,
            market: marketPda,
            userUsdc,
            userYes,
            userNo,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();

        const tx = new Transaction().add(ix);
        const signature = await sendTransaction(tx, connection);

        setStatus("confirming");
        await connection.confirmTransaction(signature, "confirmed");

        setStatus("confirmed");
        return signature;
      } catch (err) {
        setStatus("error");
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [anchorWallet, sendTransaction, connection, marketAccounts],
  );

  return { redeem, status, error };
}
