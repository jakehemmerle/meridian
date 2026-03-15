/**
 * Meridian Reset — Discover and clean up all markets
 *
 * Finds every Meridian market on-chain, closes trading markets,
 * settles unsettled ones, cancels Phoenix orders, withdraws funds,
 * merges token pairs back to USDC, and returns MM funds to deployer.
 *
 * Usage: npx tsx scripts/reset.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getLogAuthority,
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
} from "@ellipsis-labs/phoenix-sdk";

import { loadKeypair } from "../automation/src/clients/keypair.js";
import { formatUsdc, ONE_USDC } from "../automation/src/clients/format.js";
import { deriveAllMarketPdas, derivePhoenixVault } from "../automation/src/clients/pda.js";
import { buildCloseMarketIx } from "../automation/src/clients/meridian.js";
import { PHOENIX_MARKET_STATUS, buildChangeMarketStatusIx, getMarketHeader } from "../automation/src/clients/phoenix.js";
import { discoverMarkets } from "../automation/src/clients/market-discovery.js";
import { loadScriptContext } from "./_context.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function step(label: string): void {
  console.log(`\n[${"-".repeat(60)}]`);
  console.log(`  ${label}`);
  console.log(`[${"-".repeat(60)}]`);
}

function result(label: string, value: string): void {
  console.log(`  > ${label}: ${value}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         MERIDIAN RESET — Discover & Clean All Markets       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // ── Step 1: Setup ──────────────────────────────────────────────────────

  step("Load context");

  const { connection, payer, programId, program, configPda, usdcMint } = await loadScriptContext();
  const marketMaker = loadKeypair("keys/demo-wallet-2.json");

  result("Payer", payer.publicKey.toBase58());
  result("Market maker", marketMaker.publicKey.toBase58());
  result("Program", programId.toBase58());

  // ── Step 2: Discover markets ───────────────────────────────────────────

  step("Discovering all Meridian markets");

  const markets = await discoverMarkets(program);

  if (markets.length === 0) {
    console.log("  No markets found. Nothing to clean up.");
    return;
  }

  console.log(`  Found ${markets.length} market(s):\n`);
  for (const m of markets) {
    const strike = Number(m.strikePrice.toString()) / ONE_USDC;
    console.log(`    ${m.pda.toBase58().slice(0, 16)}...  phase=${m.phase}  outcome=${m.outcome}  strike=$${strike}`);
  }

  // ── Step 3: Clean up each market ───────────────────────────────────────

  const logAuth = getLogAuthority();
  const { createCancelAllOrdersWithFreeFundsInstruction } = await import(
    "@ellipsis-labs/phoenix-sdk/src/instructions/CancelAllOrdersWithFreeFunds.js"
  );
  const { createWithdrawFundsInstruction } = await import(
    "@ellipsis-labs/phoenix-sdk/src/instructions/WithdrawFunds.js"
  );

  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];
    step(`Market ${i + 1}/${markets.length}: ${m.pda.toBase58().slice(0, 24)}...  [${m.phase}]`);

    try {
      const phoenixMarketAddr = m.phoenixMarket;
      const { vault: vaultPda, yesMint: yesMintPda, noMint: noMintPda } = deriveAllMarketPdas(programId, m.pda);
      const [phoenixBaseVault] = derivePhoenixVault(phoenixMarketAddr, yesMintPda);
      const [phoenixQuoteVault] = derivePhoenixVault(phoenixMarketAddr, usdcMint);

      // ── Close if trading ─────────────────────────────────────────────

      if (m.phase === "trading") {
        // Close Phoenix market: Active -> PostOnly -> Closed
        try {
          const header = await getMarketHeader(connection, phoenixMarketAddr);
          const status = Number(header.status);
          if (status < PHOENIX_MARKET_STATUS.CLOSED) {
            if (status === PHOENIX_MARKET_STATUS.ACTIVE) {
              const ix = buildChangeMarketStatusIx(phoenixMarketAddr, payer.publicKey, PHOENIX_MARKET_STATUS.POST_ONLY);
              const sig = await connection.sendTransaction(new Transaction().add(ix), [payer]);
              await connection.confirmTransaction(sig, "confirmed");
              result("Phoenix", "Active -> PostOnly");
            }
            const ix = buildChangeMarketStatusIx(phoenixMarketAddr, payer.publicKey, PHOENIX_MARKET_STATUS.CLOSED);
            const sig = await connection.sendTransaction(new Transaction().add(ix), [payer]);
            await connection.confirmTransaction(sig, "confirmed");
            result("Phoenix", "-> Closed");
          } else {
            result("Phoenix", "already closed/tombstoned");
          }
        } catch (e: any) {
          result("Phoenix close", `skipped (${e.message?.slice(0, 60)})`);
        }

        // Close Meridian market
        try {
          const ix = buildCloseMarketIx(m.pda, payer.publicKey, programId);
          const sig = await connection.sendTransaction(new Transaction().add(ix), [payer]);
          await connection.confirmTransaction(sig, "confirmed");
          result("Meridian", "market closed");
        } catch (e: any) {
          result("Meridian close", `skipped (${e.message?.slice(0, 60)})`);
        }
      }

      // ── Settle if closed (or just got closed) ────────────────────────

      // Re-fetch phase after potential close
      const fresh = await (program.account as any).meridianMarket.fetch(m.pda);
      const currentPhase = Object.keys(fresh.phase)[0];

      if (currentPhase === "closed") {
        const overridePrice = Number(m.strikePrice.toString()) + 10 * ONE_USDC;
        try {
          const sig = await (program.methods as any)
            .adminSettleOverride(new anchor.BN(overridePrice))
            .accounts({ adminAuthority: payer.publicKey, config: configPda, market: m.pda })
            .signers([payer])
            .rpc();
          result("Settled", `override price $${overridePrice / ONE_USDC} (Yes wins)`);
        } catch (e: any) {
          result("Settle", `skipped (${e.message?.slice(0, 60)})`);
        }
      }

      // ── Cancel orders + withdraw for both traders ────────────────────

      for (const [label, trader] of [["Payer", payer], ["MM", marketMaker]] as const) {
        try {
          const cancelIx = createCancelAllOrdersWithFreeFundsInstruction({
            phoenixProgram: PHOENIX_PROGRAM_ID, logAuthority: logAuth,
            market: phoenixMarketAddr, trader: trader.publicKey,
          });
          await connection.sendTransaction(new Transaction().add(cancelIx), [trader]);
          result(`${label} orders`, "cancelled");
        } catch {
          // No orders to cancel
        }

        try {
          const traderYes = await getAssociatedTokenAddress(yesMintPda, trader.publicKey);
          const traderUsdc = await getAssociatedTokenAddress(usdcMint, trader.publicKey);
          const withdrawIx = createWithdrawFundsInstruction({
            phoenixProgram: PHOENIX_PROGRAM_ID, logAuthority: logAuth,
            market: phoenixMarketAddr, trader: trader.publicKey,
            baseAccount: traderYes, quoteAccount: traderUsdc,
            baseVault: phoenixBaseVault, quoteVault: phoenixQuoteVault,
            tokenProgram: TOKEN_PROGRAM_ID,
          }, { withdrawFundsParams: { quoteLotsToWithdraw: null, baseLotsToWithdraw: null } });
          await connection.sendTransaction(new Transaction().add(withdrawIx), [trader]);
          result(`${label} Phoenix`, "funds withdrawn");
        } catch {
          // Nothing to withdraw
        }
      }

      // ── Merge pairs + redeem for both traders ────────────────────────

      // Re-fetch to check if settled for redemption
      const afterSettle = await (program.account as any).meridianMarket.fetch(m.pda);
      const finalPhase = Object.keys(afterSettle.phase)[0];

      for (const [label, signer] of [["Payer", payer], ["MM", marketMaker]] as const) {
        const userYesAta = await getAssociatedTokenAddress(yesMintPda, signer.publicKey);
        const userNoAta = await getAssociatedTokenAddress(noMintPda, signer.publicKey);
        const userUsdcAta = await getAssociatedTokenAddress(usdcMint, signer.publicKey);

        // Merge remaining pairs back to USDC
        try {
          const yesBal = (await getAccount(connection, userYesAta)).amount;
          const noBal = (await getAccount(connection, userNoAta)).amount;
          const pairsToMerge = yesBal < noBal ? yesBal : noBal;
          if (pairsToMerge > 0n) {
            const p = Number(pairsToMerge) / ONE_USDC;
            await (program.methods as any).mergePair(new anchor.BN(p)).accounts({
              user: signer.publicKey, config: configPda, market: m.pda, vault: vaultPda,
              yesMint: yesMintPda, noMint: noMintPda, userUsdc: userUsdcAta,
              userYes: userYesAta, userNo: userNoAta, tokenProgram: TOKEN_PROGRAM_ID,
            }).signers([signer]).rpc();
            result(`${label} merge`, `${p} USDC recovered`);
          }
        } catch {
          // No pairs to merge
        }

        // Redeem winning tokens if settled
        if (finalPhase === "settled") {
          try {
            const yesBalance = (await getAccount(connection, userYesAta)).amount;
            const pairsToRedeem = Number(yesBalance) / ONE_USDC;
            if (pairsToRedeem > 0) {
              await (program.methods as any).redeem(new anchor.BN(pairsToRedeem)).accounts({
                user: signer.publicKey, config: configPda, market: m.pda, vault: vaultPda,
                yesMint: yesMintPda, noMint: noMintPda, userUsdc: userUsdcAta,
                userYes: userYesAta, userNo: userNoAta, tokenProgram: TOKEN_PROGRAM_ID,
              }).signers([signer]).rpc();
              result(`${label} redeem`, `${pairsToRedeem} winning tokens redeemed`);
            }
          } catch {
            // Nothing to redeem
          }
        }
      }

      result("Market", "cleanup complete");
    } catch (e: any) {
      console.log(`  ! Error cleaning market: ${e.message?.slice(0, 80)}`);
    }
  }

  // ── Step 4: Transfer MM USDC back to deployer ──────────────────────────

  step("Transfer MM USDC back to deployer");

  try {
    const mmUsdcAta = await getAssociatedTokenAddress(usdcMint, marketMaker.publicKey);
    const payerUsdcAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);
    const mmBal = (await getAccount(connection, mmUsdcAta)).amount;
    if (mmBal > 0n) {
      const ix = createTransferInstruction(mmUsdcAta, payerUsdcAta, marketMaker.publicKey, mmBal);
      const sig = await connection.sendTransaction(new Transaction().add(ix), [marketMaker]);
      await connection.confirmTransaction(sig, "confirmed");
      result("Returned", formatUsdc(mmBal));
    } else {
      result("MM USDC", "0 (nothing to return)");
    }
  } catch (e: any) {
    result("MM transfer", `skipped (${e.message?.slice(0, 60)})`);
  }

  // ── Summary ────────────────────────────────────────────────────────────

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RESET COMPLETE                                             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`  Markets processed: ${markets.length}`);

  try {
    const payerUsdcAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);
    const finalBal = (await getAccount(connection, payerUsdcAta)).amount;
    console.log(`  Deployer USDC:     ${formatUsdc(finalBal)}`);
  } catch {
    // ATA may not exist
  }

  console.log("");
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("\n  RESET FAILED:", err.message ?? err);
  if (err.logs) {
    console.error("\n  Program logs:");
    for (const log of err.logs) {
      console.error(`    ${log}`);
    }
  }
  process.exit(1);
});
