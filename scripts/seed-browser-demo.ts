/**
 * Meridian Browser Demo Seed
 *
 * Sets up on-chain state so the frontend can demo all user stories:
 *   1. Buy Yes, Buy No, Sell Yes, Sell No
 *   2. Position constraints (can't hold both sides)
 *   3. Settlement & redemption
 *   4. Market maker mint & quote
 *
 * Modes:
 *   pnpm seed           — local validator (creates USDC mint, airdrops SOL)
 *   pnpm seed:devnet    — devnet (reads existing USDC mint from config)
 *   pnpm seed --reset   — tear down: settle markets, recover tokens
 *   pnpm seed:devnet --reset
 *
 * The browser wallet is the same as the anchor wallet (imported into Phantom).
 * After seeding, the user opens localhost:3000 and trades interactively.
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getLogAuthority,
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
  getSeatAddress,
  createRequestSeatInstruction,
} from "@ellipsis-labs/phoenix-sdk";

import {
  createPhoenixMarket,
  MERIDIAN_PHOENIX_DEFAULTS,
  buildChangeMarketStatusIx,
  PHOENIX_MARKET_STATUS,
  getMarketHeader,
  requestSeat,
  type CreatePhoenixMarketParams,
} from "../automation/src/clients/phoenix.js";

/** Base lots per whole token — must match the Phoenix market config */
const BASE_LOTS_PER_TOKEN = Number(MERIDIAN_PHOENIX_DEFAULTS.numBaseLotsPerBaseUnit);
import { buildCloseMarketIx } from "../automation/src/clients/meridian.js";
import { loadKeypair } from "../automation/src/clients/keypair.js";
import { formatUsdc, explorerUrl, ONE_USDC } from "../automation/src/clients/format.js";
import {
  deriveConfigPda,
  deriveMarketPda,
  deriveAllMarketPdas,
  derivePhoenixVault,
} from "../automation/src/clients/pda.js";
import { discoverMarkets } from "../automation/src/clients/market-discovery.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const TICKER_AAPL = 0;
const AAPL_FEED_ID = new Uint8Array([
  73, 246, 182, 92, 177, 222, 107, 16, 234, 247, 94, 124, 3, 202, 2, 156, 48,
  109, 3, 87, 233, 27, 83, 17, 177, 117, 8, 74, 90, 213, 86, 136,
]);

const RESTING_ORDER_SIZE = 8; // 8 pairs worth of resting orders each side
const MINT_PAIRS = 20; // ideal pairs for order book liquidity
const MIN_USDC_FOR_SEED = 5; // bare minimum USDC to run the seed

// ─── CLI Flags ────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Update USDC mint in .env so the frontend stays in sync with on-chain state. */
function updateEnvUsdcMint(mintAddress: string): void {
  const envPath = ".env";
  if (!existsSync(envPath)) return;
  let content = readFileSync(envPath, "utf8");
  // Replace both backend and frontend env vars
  content = content.replace(/^MERIDIAN_USDC_MINT=.*$/m, `MERIDIAN_USDC_MINT=${mintAddress}`);
  content = content.replace(/^NEXT_PUBLIC_MERIDIAN_USDC_MINT=.*$/m, `NEXT_PUBLIC_MERIDIAN_USDC_MINT=${mintAddress}`);
  writeFileSync(envPath, content);
}

const isReset = process.argv.includes("--reset");
const isLocalFlag = process.argv.includes("--local");

// When invoked with --local, .env must exist and provide all env vars.
// Fail immediately with a clear message rather than falling through with
// missing vars or accidentally hitting devnet.
if (isLocalFlag && !existsSync(".env")) {
  console.error("Error: --local flag requires .env but the file does not exist.\n");
  console.error("  Fix: cp .env.example .env\n");
  process.exit(1);
}

// ─── Output Helpers ───────────────────────────────────────────────────────────

function step(n: number, label: string): void {
  console.log(`\n[${"=".repeat(60)}]`);
  console.log(`  STEP ${n}: ${label}`);
  console.log(`[${"=".repeat(60)}]\n`);
}

function result(label: string, value: string): void {
  console.log(`  > ${label}: ${value}`);
}

function fail(label: string, expected: string, actual: string): never {
  console.error(`  ! ${label}`);
  console.error(`    Expected: ${expected}`);
  console.error(`    Actual:   ${actual}`);
  process.exit(1);
}

// ─── Phoenix Order Helpers ────────────────────────────────────────────────────

function buildApproveSeatIx(
  phoenixMarket: PublicKey,
  marketAuthority: PublicKey,
  seat: PublicKey,
): TransactionInstruction {
  const logAuthority = getLogAuthority();
  const ixData = Buffer.alloc(2);
  ixData.writeUInt8(104, 0);
  ixData.writeUInt8(1, 1); // Approved
  return new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: marketAuthority, isWritable: false, isSigner: true },
      { pubkey: seat, isWritable: true, isSigner: false },
    ],
    data: ixData,
  });
}

function buildPlaceLimitOrderIx(
  phoenixMarket: PublicKey,
  trader: PublicKey,
  seat: PublicKey,
  baseVault: PublicKey,
  quoteVault: PublicKey,
  baseAccount: PublicKey,
  quoteAccount: PublicKey,
  side: "bid" | "ask",
  priceInTicks: bigint,
  numBaseLots: bigint,
): TransactionInstruction {
  const logAuthority = getLogAuthority();
  const packetBuf = Buffer.alloc(128);
  let offset = 0;
  packetBuf.writeUInt8(0, offset); offset += 1; // PostOnly tag
  packetBuf.writeUInt8(side === "bid" ? 0 : 1, offset); offset += 1;
  packetBuf.writeBigUInt64LE(priceInTicks, offset); offset += 8;
  packetBuf.writeBigUInt64LE(numBaseLots, offset); offset += 8;
  packetBuf.writeBigUInt64LE(0n, offset); offset += 8; // client_order_id lo
  packetBuf.writeBigUInt64LE(0n, offset); offset += 8; // client_order_id hi
  packetBuf.writeUInt8(0, offset); offset += 1; // reject_post_only
  packetBuf.writeUInt8(0, offset); offset += 1; // use_only_deposited_funds
  packetBuf.writeUInt8(0, offset); offset += 1; // last_valid_slot: None
  packetBuf.writeUInt8(0, offset); offset += 1; // last_valid_unix_timestamp: None
  packetBuf.writeUInt8(1, offset); offset += 1; // fail_silently_on_insufficient_funds

  const ixData = Buffer.alloc(1 + offset);
  ixData.writeUInt8(2, 0); // PlaceLimitOrder discriminant
  packetBuf.copy(ixData, 1, 0, offset);

  return new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: trader, isWritable: false, isSigner: true },
      { pubkey: seat, isWritable: false, isSigner: false },
      { pubkey: baseAccount, isWritable: true, isSigner: false },
      { pubkey: quoteAccount, isWritable: true, isSigner: false },
      { pubkey: baseVault, isWritable: true, isSigner: false },
      { pubkey: quoteVault, isWritable: true, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ],
    data: ixData,
  });
}

// ─── ATA Helper ───────────────────────────────────────────────────────────────

async function getOrCreateAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (info) return ata;
  return createAssociatedTokenAccount(connection, payer, mint, owner);
}

// ─── Reset Mode ───────────────────────────────────────────────────────────────

async function runReset() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║       MERIDIAN SEED RESET — Settle & Recover Tokens        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  step(1, "Load context");

  const rpcUrl = process.env.SOLANA_RPC_URL;
  const walletPath = process.env.ANCHOR_WALLET;
  const programIdStr = process.env.MERIDIAN_PROGRAM_ID;

  if (!rpcUrl || !walletPath || !programIdStr) {
    fail("Env", "SOLANA_RPC_URL, ANCHOR_WALLET, MERIDIAN_PROGRAM_ID", "missing");
  }

  const isLocal = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");

  if (isLocalFlag && !isLocal) {
    console.error("  ! --local flag set but SOLANA_RPC_URL points to a remote network:");
    console.error(`    ${rpcUrl}`);
    console.error("");
    console.error("  This means .env is missing or doesn't set SOLANA_RPC_URL.");
    console.error("  Fix: cp .env.example .env");
    console.error("");
    console.error("  If you want devnet, use: pnpm seed:devnet:reset");
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(walletPath);
  const programId = new PublicKey(programIdStr);

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = await loadIdl(programId, provider);
  const program = new anchor.Program(idl, provider);
  const [configPda] = deriveConfigPda(programId);

  result("Payer", payer.publicKey.toBase58());

  // ── Discover all markets ──────────────────────────────────────────────

  step(2, "Discover markets");

  const markets = await discoverMarkets(program);
  if (markets.length === 0) {
    console.log("  No markets found. Nothing to reset.");
    return;
  }

  console.log(`  Found ${markets.length} market(s)\n`);
  for (const m of markets) {
    const strike = Number(m.strikePrice.toString()) / ONE_USDC;
    console.log(`    ${m.pda.toBase58().slice(0, 20)}...  phase=${m.phase}  strike=$${strike}`);
  }

  // ── Process each market ───────────────────────────────────────────────

  const { createCancelAllOrdersWithFreeFundsInstruction } = await import(
    "@ellipsis-labs/phoenix-sdk/src/instructions/CancelAllOrdersWithFreeFunds.js"
  );
  const { createWithdrawFundsInstruction } = await import(
    "@ellipsis-labs/phoenix-sdk/src/instructions/WithdrawFunds.js"
  );

  const logAuth = getLogAuthority();
  const config = await (program.account as any).meridianConfig.fetch(configPda);
  const usdcMint: PublicKey = config.usdcMint;

  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];
    step(3 + i, `Reset market ${i + 1}/${markets.length} [${m.phase}]`);

    const phoenixMarketAddr = m.phoenixMarket;
    const { vault: vaultPda, yesMint: yesMintPda, noMint: noMintPda } = deriveAllMarketPdas(programId, m.pda);
    const [phoenixBaseVault] = derivePhoenixVault(phoenixMarketAddr, yesMintPda);
    const [phoenixQuoteVault] = derivePhoenixVault(phoenixMarketAddr, usdcMint);

    // Cancel orders + withdraw Phoenix funds
    try {
      const cancelIx = createCancelAllOrdersWithFreeFundsInstruction({
        phoenixProgram: PHOENIX_PROGRAM_ID, logAuthority: logAuth,
        market: phoenixMarketAddr, trader: payer.publicKey,
      });
      await connection.sendTransaction(new Transaction().add(cancelIx), [payer]);
      result("Orders", "cancelled");
    } catch { /* no orders */ }

    try {
      const userYes = await getAssociatedTokenAddress(yesMintPda, payer.publicKey);
      const userUsdc = await getAssociatedTokenAddress(usdcMint, payer.publicKey);
      const withdrawIx = createWithdrawFundsInstruction({
        phoenixProgram: PHOENIX_PROGRAM_ID, logAuthority: logAuth,
        market: phoenixMarketAddr, trader: payer.publicKey,
        baseAccount: userYes, quoteAccount: userUsdc,
        baseVault: phoenixBaseVault, quoteVault: phoenixQuoteVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      }, { withdrawFundsParams: { quoteLotsToWithdraw: null, baseLotsToWithdraw: null } });
      await connection.sendTransaction(new Transaction().add(withdrawIx), [payer]);
      result("Phoenix funds", "withdrawn");
    } catch { /* nothing to withdraw */ }

    // Close Phoenix market if active
    if (m.phase === "trading") {
      try {
        const header = await getMarketHeader(connection, phoenixMarketAddr);
        const status = Number(header.status);
        if (status < PHOENIX_MARKET_STATUS.CLOSED) {
          if (status === PHOENIX_MARKET_STATUS.ACTIVE) {
            const ix = buildChangeMarketStatusIx(phoenixMarketAddr, payer.publicKey, PHOENIX_MARKET_STATUS.POST_ONLY);
            const sig = await connection.sendTransaction(new Transaction().add(ix), [payer]);
            await connection.confirmTransaction(sig, "confirmed");
          }
          const ix = buildChangeMarketStatusIx(phoenixMarketAddr, payer.publicKey, PHOENIX_MARKET_STATUS.CLOSED);
          const sig = await connection.sendTransaction(new Transaction().add(ix), [payer]);
          await connection.confirmTransaction(sig, "confirmed");
          result("Phoenix", "closed");
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

    // Settle if closed
    const fresh = await (program.account as any).meridianMarket.fetch(m.pda);
    const currentPhase = Object.keys(fresh.phase)[0];

    if (currentPhase === "closed") {
      const overridePrice = Number(m.strikePrice.toString()) + 10 * ONE_USDC;
      try {
        await (program.methods as any)
          .adminSettleOverride(new anchor.BN(overridePrice))
          .accounts({ adminAuthority: payer.publicKey, config: configPda, market: m.pda })
          .signers([payer])
          .rpc();
        result("Settled", `$${overridePrice / ONE_USDC} (Yes wins)`);
      } catch (e: any) {
        result("Settle", `skipped (${e.message?.slice(0, 60)})`);
      }
    }

    // Merge remaining pairs
    const userYesAta = await getAssociatedTokenAddress(yesMintPda, payer.publicKey);
    const userNoAta = await getAssociatedTokenAddress(noMintPda, payer.publicKey);
    const userUsdcAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);

    try {
      const yesBal = (await getAccount(connection, userYesAta)).amount;
      const noBal = (await getAccount(connection, userNoAta)).amount;
      const pairsToMerge = yesBal < noBal ? yesBal : noBal;
      if (pairsToMerge > 0n) {
        const p = Number(pairsToMerge) / ONE_USDC;
        await (program.methods as any).mergePair(new anchor.BN(p)).accounts({
          user: payer.publicKey, config: configPda, market: m.pda, vault: vaultPda,
          yesMint: yesMintPda, noMint: noMintPda, userUsdc: userUsdcAta,
          userYes: userYesAta, userNo: userNoAta, tokenProgram: TOKEN_PROGRAM_ID,
        }).signers([payer]).rpc();
        result("Merged", `${p} pairs -> USDC`);
      }
    } catch { /* nothing to merge */ }

    // Redeem winning tokens if settled
    const afterSettle = await (program.account as any).meridianMarket.fetch(m.pda);
    if (Object.keys(afterSettle.phase)[0] === "settled") {
      try {
        const yesBal = (await getAccount(connection, userYesAta)).amount;
        const pairsToRedeem = Number(yesBal) / ONE_USDC;
        if (pairsToRedeem > 0) {
          await (program.methods as any).redeem(new anchor.BN(pairsToRedeem)).accounts({
            user: payer.publicKey, config: configPda, market: m.pda, vault: vaultPda,
            yesMint: yesMintPda, noMint: noMintPda, userUsdc: userUsdcAta,
            userYes: userYesAta, userNo: userNoAta, tokenProgram: TOKEN_PROGRAM_ID,
          }).signers([payer]).rpc();
          result("Redeemed", `${pairsToRedeem} winning tokens`);
        }
      } catch { /* nothing to redeem */ }
    }

    result("Market", "cleanup done");
  }

  // ── Final balances ──────────────────────────────────────────────────────

  step(3 + markets.length, "Final balances");

  try {
    const payerUsdcAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);
    const finalBal = (await getAccount(connection, payerUsdcAta)).amount;
    result("USDC", formatUsdc(finalBal));
  } catch { /* ATA may not exist */ }

  const solBal = await connection.getBalance(payer.publicKey);
  result("SOL", `${solBal / LAMPORTS_PER_SOL}`);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RESET COMPLETE                                             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

// ─── Seed Mode ────────────────────────────────────────────────────────────────

async function runSeed() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     MERIDIAN BROWSER DEMO SEED — Setup for Live Trading     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // ── Step 1: Environment ─────────────────────────────────────────────────

  step(1, "Validate environment");

  const rpcUrl = process.env.SOLANA_RPC_URL;
  const walletPath = process.env.ANCHOR_WALLET;
  const programIdStr = process.env.MERIDIAN_PROGRAM_ID;
  const pythReceiverStr = process.env.MERIDIAN_PYTH_RECEIVER_PROGRAM_ID;

  if (!rpcUrl || !walletPath || !programIdStr || !pythReceiverStr) {
    fail("Env", "SOLANA_RPC_URL, ANCHOR_WALLET, MERIDIAN_PROGRAM_ID, MERIDIAN_PYTH_RECEIVER_PROGRAM_ID", "missing");
  }

  const isLocal = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");

  if (isLocalFlag && !isLocal) {
    console.error("  ! --local flag set but SOLANA_RPC_URL points to a remote network:");
    console.error(`    ${rpcUrl}`);
    console.error("");
    console.error("  This means .env is missing or doesn't set SOLANA_RPC_URL.");
    console.error("  Fix: cp .env.example .env");
    console.error("");
    console.error("  If you want devnet, use: pnpm seed:devnet");
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(walletPath);
  const programId = new PublicKey(programIdStr);
  const pythReceiver = new PublicKey(pythReceiverStr);

  const version = await connection.getVersion();
  result("RPC", `${rpcUrl} (solana-core ${version["solana-core"]})`);
  result("Mode", isLocal ? "local validator" : "devnet");
  result("Payer", payer.publicKey.toBase58());

  // ── Step 2: Ensure SOL balance ──────────────────────────────────────────

  step(2, "Ensure SOL balance");

  let balance = await connection.getBalance(payer.publicKey);
  if (isLocal && balance < 2 * LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    balance = await connection.getBalance(payer.publicKey);
    result("Airdrop", "5 SOL");
  }
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    fail("SOL balance", ">= 0.5 SOL", `${balance / LAMPORTS_PER_SOL} SOL`);
  }
  result("Balance", `${balance / LAMPORTS_PER_SOL} SOL`);

  // ── Step 3: Anchor setup ───────────────────────────────────────────────

  step(3, "Anchor setup");

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = await loadIdl(programId, provider);
  const program = new anchor.Program(idl, provider);
  result("IDL", "loaded");

  // ── Step 4: Config PDA ─────────────────────────────────────────────────

  step(4, "Initialize config PDA (idempotent)");

  const [configPda] = deriveConfigPda(programId);
  result("Config PDA", configPda.toBase58());

  // Read USDC mint from env (devnet) or on-chain config
  const usdcMintStr = process.env.MERIDIAN_USDC_MINT ?? "";
  let usdcMint: PublicKey;

  const configAccount = await connection.getAccountInfo(configPda);
  if (configAccount && configAccount.data.length > 0) {
    const existingCfg = await (program.account as any).meridianConfig.fetch(configPda);
    usdcMint = existingCfg.usdcMint;
    result("Config", "already initialized");
    result("USDC mint (from config)", usdcMint.toBase58());
  } else {
    // Config doesn't exist yet — need a USDC mint
    if (isLocal) {
      // On local validator, create a fresh USDC mint (payer is mint authority)
      if (usdcMintStr) {
        // Check if the env mint exists on-chain (may be stale from prior validator)
        const mintInfo = await connection.getAccountInfo(new PublicKey(usdcMintStr));
        if (mintInfo) {
          usdcMint = new PublicKey(usdcMintStr);
          result("USDC mint (from env)", usdcMint.toBase58());
        } else {
          result("USDC mint from env", "not found on-chain (stale) — creating new");
          usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
          updateEnvUsdcMint(usdcMint.toBase58());
          result("USDC mint created", usdcMint.toBase58());
          result(".env updated", "MERIDIAN_USDC_MINT + NEXT_PUBLIC_MERIDIAN_USDC_MINT");
        }
      } else {
        usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
        updateEnvUsdcMint(usdcMint.toBase58());
        result("USDC mint created", usdcMint.toBase58());
        result(".env updated", "MERIDIAN_USDC_MINT + NEXT_PUBLIC_MERIDIAN_USDC_MINT");
      }
    } else if (usdcMintStr) {
      usdcMint = new PublicKey(usdcMintStr);
    } else {
      fail("USDC mint", "MERIDIAN_USDC_MINT in .env or existing config", "neither found");
    }

    const sig = await (program.methods as any)
      .initializeConfig({
        adminAuthority: payer.publicKey,
        operationsAuthority: payer.publicKey,
        usdcMint,
        pythReceiverProgram: pythReceiver,
        oracleMaximumAgeSeconds: 600,
        oracleConfidenceLimitBps: 250,
      })
      .accounts({
        payer: payer.publicKey,
        adminAuthority: payer.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
    result("Config initialized", explorerUrl(sig));
  }

  // ── Step 5: Ensure USDC balance ─────────────────────────────────────────

  step(5, "Ensure USDC balance for demo");

  const payerUsdcAta = await getOrCreateAta(connection, payer, usdcMint, payer.publicKey);
  let usdcBalance: bigint;
  try {
    usdcBalance = (await getAccount(connection, payerUsdcAta)).amount;
  } catch {
    usdcBalance = 0n;
  }

  const idealUsdc = BigInt(MINT_PAIRS * ONE_USDC);
  result("Current USDC", formatUsdc(usdcBalance));
  result("Ideal USDC", formatUsdc(idealUsdc));

  // Try to mint more if we're short
  if (usdcBalance < idealUsdc) {
    try {
      const deficit = idealUsdc - usdcBalance;
      await mintTo(connection, payer, usdcMint, payerUsdcAta, payer.publicKey, deficit);
      usdcBalance = (await getAccount(connection, payerUsdcAta)).amount;
      result("Minted USDC", formatUsdc(deficit));
    } catch {
      result("Mint authority", "payer is not USDC mint authority — using existing balance");
    }
  }

  // Determine how many pairs we can actually mint
  const availableForMint = Number(usdcBalance) / ONE_USDC;
  let actualMintPairs = Math.min(MINT_PAIRS, Math.floor(availableForMint));

  if (actualMintPairs < MIN_USDC_FOR_SEED) {
    fail("USDC", `>= ${MIN_USDC_FOR_SEED} USDC`, `${formatUsdc(usdcBalance)} — run --reset first to recover tokens`);
  }

  result("USDC available", formatUsdc(usdcBalance));
  result("Will mint", `${actualMintPairs} pairs`);

  // ── Step 6: Create Meridian market ──────────────────────────────────────

  step(6, "Create Meridian market (AAPL)");

  const now = new Date();
  const tradingDay =
    now.getUTCFullYear() * 10000 +
    (now.getUTCMonth() + 1) * 100 +
    now.getUTCDate();

  // Try strikes $200, $210, $220, ... until we find one that's either fresh
  // or already in trading phase with a live Phoenix market
  const STRIKE_CANDIDATES = [200, 210, 220, 230, 190, 180];
  let strikePrice: bigint = 0n;
  let marketPda: PublicKey = PublicKey.default;
  let marketExists = false;
  let phoenixMarketAddr: PublicKey = PublicKey.default;

  for (const candidate of STRIKE_CANDIDATES) {
    const candidateStrike = BigInt(candidate * ONE_USDC);
    const [candidatePda] = deriveMarketPda(programId, TICKER_AAPL, tradingDay, candidateStrike);

    try {
      const acct = await connection.getAccountInfo(candidatePda);
      if (!acct || acct.data.length === 0) {
        // Fresh — use this strike
        strikePrice = candidateStrike;
        marketPda = candidatePda;
        result("Strike", `$${candidate} (fresh)`);
        break;
      }

      // Market exists — check if it's reusable
      const existingMarket = await (program.account as any).meridianMarket.fetch(candidatePda);
      const phase = Object.keys(existingMarket.phase)[0];
      if (phase !== "trading") {
        result("Strike $" + candidate, `skipping (${phase})`);
        continue;
      }

      // Check Phoenix market health
      const existingPhoenix = existingMarket.phoenixMarket;
      try {
        const header = await getMarketHeader(connection, existingPhoenix);
        const status = Number(header.status);
        if (status >= PHOENIX_MARKET_STATUS.CLOSED) {
          result("Strike $" + candidate, "skipping (Phoenix closed)");
          continue;
        }
      } catch {
        result("Strike $" + candidate, "skipping (Phoenix missing)");
        continue;
      }

      // Reusable
      strikePrice = candidateStrike;
      marketPda = candidatePda;
      phoenixMarketAddr = existingMarket.phoenixMarket;
      marketExists = true;
      result("Strike", `$${candidate} (reusing existing market)`);
      break;
    } catch {
      // Error fetching — treat as fresh
      strikePrice = candidateStrike;
      marketPda = candidatePda;
      result("Strike", `$${candidate} (fresh)`);
      break;
    }
  }

  if (strikePrice === 0n) {
    fail("Strike", "at least one available strike", "all candidates occupied — run --reset first");
  }

  const { vault: vaultPda, yesMint: yesMintPda, noMint: noMintPda } = deriveAllMarketPdas(programId, marketPda);

  result("Market PDA", marketPda.toBase58());
  result("Trading day", String(tradingDay));
  result("Strike", `$${Number(strikePrice) / ONE_USDC}`);

  const phoenixMarketKeypair = Keypair.generate();

  // On local, set close_time in the past so `pnpm seed:reset` can immediately
  // close + settle. Trading still works (trade_yes only checks phase, not clock).
  // On devnet, keep +24h so the market stays open for demo sessions.
  const nowTs = Math.floor(Date.now() / 1000);
  const closeTimeTs = new anchor.BN(isLocal ? nowTs - 3601 : nowTs + 86400);
  const settleAfterTs = new anchor.BN(closeTimeTs.toNumber() + 600);

  if (!marketExists) {
    const sig = await (program.methods as any)
      .createMarket({
        ticker: { aapl: {} },
        tradingDay,
        strikePrice: new anchor.BN(Number(strikePrice)),
        previousClose: new anchor.BN(198 * ONE_USDC),
        closeTimeTs,
        settleAfterTs,
        oracleFeedId: Array.from(AAPL_FEED_ID),
        phoenixMarket: phoenixMarketKeypair.publicKey,
      })
      .accounts({
        payer: payer.publicKey,
        operationsAuthority: payer.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
    result("Market created", explorerUrl(sig));
    phoenixMarketAddr = phoenixMarketKeypair.publicKey;
  }

  // ── Step 7: Create Phoenix order book ──────────────────────────────────

  step(7, "Create Phoenix market + activate");

  if (!marketExists) {
    await createPhoenixMarket(
      connection,
      payer,
      {
        ...MERIDIAN_PHOENIX_DEFAULTS,
        baseMint: yesMintPda,
        quoteMint: usdcMint,
      },
      phoenixMarketKeypair,
    );
    result("Phoenix market", phoenixMarketAddr!.toBase58());

    // Activate (PostOnly -> Active)
    const activateIx = buildChangeMarketStatusIx(phoenixMarketAddr!, payer.publicKey, PHOENIX_MARKET_STATUS.ACTIVE);
    const activateSig = await connection.sendTransaction(new Transaction().add(activateIx), [payer]);
    await connection.confirmTransaction(activateSig, "confirmed");
    result("Phoenix status", "Active");
  } else {
    result("Phoenix", "already exists");
  }

  // ── Step 8: Request + approve seat ─────────────────────────────────────

  step(8, "Request and approve Phoenix seat");

  const seatPubkey = getSeatAddress(phoenixMarketAddr!, payer.publicKey);
  let seatExists = false;
  try {
    const seatAcct = await connection.getAccountInfo(seatPubkey);
    if (seatAcct && seatAcct.data.length > 0) {
      seatExists = true;
      result("Seat", "already exists");
    }
  } catch { /* doesn't exist */ }

  if (!seatExists) {
    const requestIx = createRequestSeatInstruction({
      phoenixProgram: PHOENIX_PROGRAM_ID,
      logAuthority: getLogAuthority(),
      market: phoenixMarketAddr!,
      payer: payer.publicKey,
      seat: seatPubkey,
    });
    const approveIx = buildApproveSeatIx(phoenixMarketAddr!, payer.publicKey, seatPubkey);
    const seatTx = new Transaction().add(requestIx, approveIx);
    const seatSig = await connection.sendTransaction(seatTx, [payer]);
    await connection.confirmTransaction(seatSig, "confirmed");
    result("Seat", "requested + approved");
  }

  result("Seat address", seatPubkey.toBase58());

  // ── Step 9: Create token accounts ─────────────────────────────────────

  step(9, "Create token accounts");

  const userYesAta = await getOrCreateAta(connection, payer, yesMintPda, payer.publicKey);
  const userNoAta = await getOrCreateAta(connection, payer, noMintPda, payer.publicKey);

  result("USDC ATA", payerUsdcAta.toBase58());
  result("Yes ATA", userYesAta.toBase58());
  result("No ATA", userNoAta.toBase58());

  // ── Step 10: Mint pairs for order book liquidity ────────────────────────

  step(10, `Mint ${actualMintPairs} Yes/No pairs for order book liquidity`);

  const mintSig = await (program.methods as any)
    .mintPair(new anchor.BN(actualMintPairs))
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      vault: vaultPda,
      yesMint: yesMintPda,
      noMint: noMintPda,
      userUsdc: payerUsdcAta,
      userYes: userYesAta,
      userNo: userNoAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  result("Minted", `${actualMintPairs} pairs (${actualMintPairs} USDC deposited)`);
  result("Tx", explorerUrl(mintSig));

  // ── Step 11: Place resting orders (liquidity for all 4 trade paths) ────

  step(11, "Place resting orders on Phoenix (bids + asks)");

  const [phoenixBaseVault] = derivePhoenixVault(phoenixMarketAddr!, yesMintPda);
  const [phoenixQuoteVault] = derivePhoenixVault(phoenixMarketAddr!, usdcMint);

  // Place multiple price levels so the order book looks real
  // Bids: 45, 48, 50 (buying Yes cheap — needed for Sell Yes and Buy No)
  // Asks: 52, 55, 58 (selling Yes expensive — needed for Buy Yes and Sell No)
  // Scale order sizes to available pairs (leave some free for the user to hold)
  const orderPairs = Math.min(RESTING_ORDER_SIZE, Math.floor(actualMintPairs * 0.4));
  const perLevel = Math.max(1, Math.floor(orderPairs / 3));

  const bidLevels = [
    { price: 45n, size: BigInt(perLevel) },
    { price: 48n, size: BigInt(perLevel) },
    { price: 50n, size: BigInt(perLevel) },
  ];
  const askLevels = [
    { price: 52n, size: BigInt(perLevel) },
    { price: 55n, size: BigInt(perLevel) },
    { price: 58n, size: BigInt(perLevel) },
  ];

  // Bids require USDC on the quote side. After mintPair, all USDC is in the
  // vault, so mint extra USDC to fund the bid liquidity (local only).
  const totalBidUsdc = bidLevels.reduce((sum, l) => sum + Number(l.size), 0);
  if (isLocal) {
    try {
      await mintTo(connection, payer, usdcMint, payerUsdcAta, payer.publicKey, BigInt(totalBidUsdc * ONE_USDC));
      result("Extra USDC for bids", `${totalBidUsdc} USDC`);
    } catch {
      result("Extra USDC", "skipped (not mint authority)");
    }
  }

  // Place bids
  for (const level of bidLevels) {
    const ix = buildPlaceLimitOrderIx(
      phoenixMarketAddr!, payer.publicKey, seatPubkey,
      phoenixBaseVault, phoenixQuoteVault,
      userYesAta, payerUsdcAta,
      "bid", level.price, level.size * BigInt(BASE_LOTS_PER_TOKEN),
    );
    const sig = await connection.sendTransaction(new Transaction().add(ix), [payer]);
    await connection.confirmTransaction(sig, "confirmed");
    result(`Bid @${level.price}`, `${level.size} Yes`);
  }

  // Place asks
  for (const level of askLevels) {
    const ix = buildPlaceLimitOrderIx(
      phoenixMarketAddr!, payer.publicKey, seatPubkey,
      phoenixBaseVault, phoenixQuoteVault,
      userYesAta, payerUsdcAta,
      "ask", level.price, level.size * BigInt(BASE_LOTS_PER_TOKEN),
    );
    const sig = await connection.sendTransaction(new Transaction().add(ix), [payer]);
    await connection.confirmTransaction(sig, "confirmed");
    result(`Ask @${level.price}`, `${level.size} Yes`);
  }

  // ── Step 12: Summary ──────────────────────────────────────────────────

  step(12, "Seed complete — ready for browser demo");

  const vaultBal = (await getAccount(connection, vaultPda)).amount;
  const yesBal = (await getAccount(connection, userYesAta)).amount;
  const noBal = (await getAccount(connection, userNoAta)).amount;
  const finalUsdc = (await getAccount(connection, payerUsdcAta)).amount;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SEED COMPLETE — Open http://localhost:3000 to demo         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("  On-chain state:");
  console.log(`    Market:      ${marketPda.toBase58()}`);
  console.log(`    Phoenix:     ${phoenixMarketAddr!.toBase58()}`);
  console.log(`    Ticker:      AAPL`);
  console.log(`    Strike:      $${Number(strikePrice) / ONE_USDC}`);
  console.log(`    Trading day: ${tradingDay}`);
  console.log(`    Close time:  ${isLocal ? "past (reset-ready)" : "+24 hours (demo stays open)"}`);
  console.log("");
  console.log("  Wallet balances:");
  console.log(`    USDC:  ${formatUsdc(finalUsdc)}`);
  console.log(`    Yes:   ${formatUsdc(yesBal)}`);
  console.log(`    No:    ${formatUsdc(noBal)}`);
  console.log(`    Vault: ${formatUsdc(vaultBal)}`);
  console.log("");
  console.log("  Order book (Phoenix):");
  console.log("    Bids: @45, @48, @50 (for Buy Yes / Sell No fills)");
  console.log("    Asks: @52, @55, @58 (for Sell Yes / Buy No fills)");
  console.log("");
  console.log("  Demo flow:");
  console.log("    1. Import anchor wallet into Phantom (devnet mode)");
  console.log("    2. Open http://localhost:3000");
  console.log("    3. Walk through: Buy Yes -> Sell Yes -> Buy No -> Sell No");
  console.log("    4. Run `pnpm seed --reset` to settle + redeem + clean up");
  console.log("");
}

// ─── IDL Loader ───────────────────────────────────────────────────────────────

async function loadIdl(programId: PublicKey, provider: anchor.AnchorProvider) {
  let idl = await anchor.Program.fetchIdl(programId, provider);
  if (!idl) {
    try {
      const { readFileSync } = await import("node:fs");
      idl = JSON.parse(readFileSync("target/idl/meridian.json", "utf8"));
    } catch {
      fail("IDL", "on-chain or target/idl/meridian.json", "not found — run `anchor build`");
    }
  }
  return idl!;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function main() {
  if (isReset) {
    await runReset();
  } else {
    await runSeed();
  }
}

main().catch((err) => {
  console.error("\n  ! SEED FAILED:", err.message ?? err);
  if (err.logs) {
    console.error("\n  Program logs:");
    for (const log of err.logs) {
      console.error(`    ${log}`);
    }
  }
  process.exit(1);
});
