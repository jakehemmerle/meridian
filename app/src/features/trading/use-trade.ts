"use client";

import { useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useProgram } from "../../lib/solana/program";
import { readPublicMeridianEnv } from "../../lib/env/public";
import {
  deriveConfigPda,
  derivePhoenixVault,
  derivePhoenixLogAuthority,
  derivePhoenixSeat,
} from "../../lib/solana/pda";
import type { MarketSummary } from "../markets/model";
import { type TradeIntent, getIntentInstructionPlan } from "./model";

const ONE_TOKEN = 1_000_000;

export function useTrade(market: MarketSummary | null) {
  const program = useProgram();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const env = useMemo(() => {
    const cfg = readPublicMeridianEnv();
    return {
      usdcMint: new PublicKey(cfg.usdcMint),
      phoenixProgram: new PublicKey(cfg.phoenixProgramId),
    };
  }, []);

  const ensureAtas = useCallback(
    async (mints: PublicKey[]): Promise<{
      atas: PublicKey[];
      createIxs: any[];
    }> => {
      if (!publicKey) throw new Error("Wallet not connected");
      const atas = await Promise.all(
        mints.map((m) => getAssociatedTokenAddress(m, publicKey)),
      );
      const createIxs = mints.map((mint, i) =>
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          atas[i],
          publicKey,
          mint,
        ),
      );
      return { atas, createIxs };
    },
    [publicKey],
  );

  const buildMintPairIx = useCallback(
    async (pairs: number) => {
      if (!program || !market || !publicKey)
        throw new Error("Not ready");
      const [config] = deriveConfigPda(program.programId);
      const { atas, createIxs } = await ensureAtas([
        env.usdcMint,
        market.yesMint,
        market.noMint,
      ]);
      const ix = await (program.methods as any)
        .mintPair(new BN(pairs))
        .accounts({
          user: publicKey,
          config,
          market: market.pda,
          vault: market.vault,
          yesMint: market.yesMint,
          noMint: market.noMint,
          userUsdc: atas[0],
          userYes: atas[1],
          userNo: atas[2],
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      return [...createIxs, ix];
    },
    [program, market, publicKey, env, ensureAtas],
  );

  const buildTradeYesIx = useCallback(
    async (side: "Buy" | "Sell", lots: number) => {
      if (!program || !market || !publicKey)
        throw new Error("Not ready");
      const [config] = deriveConfigPda(program.programId);
      const userUsdc = await getAssociatedTokenAddress(
        env.usdcMint,
        publicKey,
      );
      const userYes = await getAssociatedTokenAddress(
        market.yesMint,
        publicKey,
      );
      const [phoenixBaseVault] = derivePhoenixVault(
        env.phoenixProgram,
        market.phoenixMarket,
        market.yesMint,
      );
      const [phoenixQuoteVault] = derivePhoenixVault(
        env.phoenixProgram,
        market.phoenixMarket,
        env.usdcMint,
      );
      const [seat] = derivePhoenixSeat(
        env.phoenixProgram,
        market.phoenixMarket,
        publicKey,
      );
      const [logAuthority] = derivePhoenixLogAuthority(env.phoenixProgram);

      // IOC: high limit price for buys, low for sells
      const priceInTicks = side === "Buy" ? new BN(100) : new BN(1);

      const ix = await (program.methods as any)
        .tradeYes({
          side: side === "Buy" ? { buy: {} } : { sell: {} },
          numBaseLots: new BN(lots * ONE_TOKEN),
          priceInTicks,
          lastValidUnixTimestampInSeconds: null,
        })
        .accounts({
          user: publicKey,
          config,
          market: market.pda,
          yesMint: market.yesMint,
          phoenixMarket: market.phoenixMarket,
          userYes,
          userUsdc,
          phoenixBaseVault,
          phoenixQuoteVault,
          seat,
          logAuthority,
          phoenixProgram: env.phoenixProgram,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      return [ix];
    },
    [program, market, publicKey, env],
  );

  const buildMergePairIx = useCallback(
    async (pairs: number) => {
      if (!program || !market || !publicKey)
        throw new Error("Not ready");
      const [config] = deriveConfigPda(program.programId);
      const userUsdc = await getAssociatedTokenAddress(
        env.usdcMint,
        publicKey,
      );
      const userYes = await getAssociatedTokenAddress(
        market.yesMint,
        publicKey,
      );
      const userNo = await getAssociatedTokenAddress(
        market.noMint,
        publicKey,
      );

      const ix = await (program.methods as any)
        .mergePair(new BN(pairs))
        .accounts({
          user: publicKey,
          config,
          market: market.pda,
          vault: market.vault,
          yesMint: market.yesMint,
          noMint: market.noMint,
          userUsdc,
          userYes,
          userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      return [ix];
    },
    [program, market, publicKey, env],
  );

  const executeIntent = useCallback(
    async (intent: TradeIntent, quantity: number): Promise<string> => {
      if (!sendTransaction || !publicKey)
        throw new Error("Wallet not connected");

      const plan = getIntentInstructionPlan(intent);
      const tx = new Transaction();

      for (const step of plan) {
        let ixs;
        switch (step.type) {
          case "mint_pair":
            ixs = await buildMintPairIx(quantity);
            break;
          case "trade_yes":
            ixs = await buildTradeYesIx(step.side!, quantity);
            break;
          case "merge_pair":
            ixs = await buildMergePairIx(quantity);
            break;
        }
        tx.add(...ixs);
      }

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    },
    [
      sendTransaction,
      publicKey,
      connection,
      buildMintPairIx,
      buildTradeYesIx,
      buildMergePairIx,
    ],
  );

  const redeem = useCallback(
    async (pairs: number): Promise<string> => {
      if (!program || !market || !publicKey || !sendTransaction)
        throw new Error("Not connected");

      const [config] = deriveConfigPda(program.programId);
      const { atas, createIxs } = await ensureAtas([
        env.usdcMint,
        market.yesMint,
        market.noMint,
      ]);

      const ix = await (program.methods as any)
        .redeem(new BN(pairs))
        .accounts({
          user: publicKey,
          config,
          market: market.pda,
          vault: market.vault,
          yesMint: market.yesMint,
          noMint: market.noMint,
          userUsdc: atas[0],
          userYes: atas[1],
          userNo: atas[2],
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(...createIxs, ix);

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    },
    [program, market, publicKey, sendTransaction, connection, env, ensureAtas],
  );

  return { executeIntent, redeem };
}
