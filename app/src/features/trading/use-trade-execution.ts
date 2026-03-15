import { useState, useCallback } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getLogAuthority,
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
  getSeatAddress,
} from "@ellipsis-labs/phoenix-sdk";
import { BN } from "@coral-xyz/anchor";

import { getMeridianProgram } from "../../lib/solana/program";
import { type TradeIntent, getIntentInstructionPlan } from "./model";

export type TradeStatus =
  | "idle"
  | "building"
  | "signing"
  | "confirming"
  | "confirmed"
  | "error";

export interface TradeExecution {
  execute: (intent: TradeIntent, quantity: bigint) => Promise<string>;
  status: TradeStatus;
  error: string | null;
  lastTxSignature: string | null;
}

/** Derive Phoenix vault PDA: seeds = ["vault", market, mint] */
function derivePhoenixVault(market: PublicKey, mint: PublicKey): PublicKey {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer(), mint.toBuffer()],
    PHOENIX_PROGRAM_ID,
  );
  return vault;
}

export interface MarketAccounts {
  marketPda: PublicKey;
  phoenixMarket: PublicKey;
  configPda: PublicKey;
  vaultPda: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  usdcMint: PublicKey;
}

export function useTradeExecution(marketAccounts: MarketAccounts): TradeExecution {
  const { connection } = useConnection();
  const { sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [status, setStatus] = useState<TradeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);

  const execute = useCallback(
    async (intent: TradeIntent, quantity: bigint): Promise<string> => {
      if (!anchorWallet || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      setStatus("building");
      setError(null);

      try {
        const program = getMeridianProgram(connection, anchorWallet);
        const plan = getIntentInstructionPlan(intent);
        const user = anchorWallet.publicKey;

        const {
          marketPda,
          phoenixMarket,
          yesMint,
          usdcMint,
        } = marketAccounts;

        const userUsdc = getAssociatedTokenAddressSync(usdcMint, user);
        const userYes = getAssociatedTokenAddressSync(yesMint, user);
        const userNo = getAssociatedTokenAddressSync(marketAccounts.noMint, user);

        const seat = getSeatAddress(phoenixMarket, user);
        const phoenixBaseVault = derivePhoenixVault(phoenixMarket, yesMint);
        const phoenixQuoteVault = derivePhoenixVault(phoenixMarket, usdcMint);

        const tx = new Transaction();

        for (const step of plan) {
          if (step.type === "trade_yes") {
            const ix = await program.methods
              .tradeYes({
                side: step.side === "Buy" ? { buy: {} } : { sell: {} },
                numBaseLots: new BN(quantity.toString()),
                priceInTicks: step.side === "Buy" ? new BN(100) : new BN(1),
                lastValidUnixTimestampInSeconds: null,
              })
              .accountsPartial({
                user,
                market: marketPda,
                phoenixMarket,
                userYes,
                userUsdc,
                phoenixBaseVault,
                phoenixQuoteVault,
                seat,
                logAuthority: getLogAuthority(),
                phoenixProgram: PHOENIX_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
              })
              .instruction();
            tx.add(ix);
          } else if (step.type === "mint_pair") {
            const ix = await program.methods
              .mintPair(new BN(quantity.toString()))
              .accountsPartial({
                user,
                market: marketPda,
                userUsdc,
                userYes,
                userNo,
                tokenProgram: TOKEN_PROGRAM_ID,
              })
              .instruction();
            tx.add(ix);
          } else if (step.type === "merge_pair") {
            const ix = await program.methods
              .mergePair(new BN(quantity.toString()))
              .accountsPartial({
                user,
                market: marketPda,
                userUsdc,
                userYes,
                userNo,
                tokenProgram: TOKEN_PROGRAM_ID,
              })
              .instruction();
            tx.add(ix);
          }
        }

        setStatus("signing");
        const signature = await sendTransaction(tx, connection);

        setStatus("confirming");
        await connection.confirmTransaction(signature, "confirmed");

        setStatus("confirmed");
        setLastTxSignature(signature);
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

  return { execute, status, error, lastTxSignature };
}
