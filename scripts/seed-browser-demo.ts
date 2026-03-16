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
  createTransferInstruction,
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

const DEMO_TRADER_USDC = 10; // lets the browser wallet walk through all trade intents
const DEMO_MARKET_MAKER_KEYPAIR_PATH = "keys/demo-wallet-2.json";
const MM_BOOK_LEVELS = 3;
const MM_TARGET_LEVEL_SIZE = 2; // enough depth for a small live demo without draining devnet USDC
const MM_BID_PRICES = [45n, 48n, 50n] as const;
const MM_ASK_PRICES = [52n, 55n, 58n] as const;

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

function buildLiquidityPlan(
  traderUsdcBalance: bigint,
  traderReserveUsdc: bigint,
  mmUsdcBalance: bigint,
): {
  actualMintPairs: number;
  perLevel: number;
  bidLevels: { price: bigint; size: bigint }[];
  askLevels: { price: bigint; size: bigint }[];
  mmTargetUsdc: bigint;
} {
  const spendableTraderUsdc =
    traderUsdcBalance > traderReserveUsdc ? traderUsdcBalance - traderReserveUsdc : 0n;
  const totalMmBudgetUnits = Number((mmUsdcBalance + spendableTraderUsdc) / BigInt(ONE_USDC));
  const maxPerLevel = Math.floor(totalMmBudgetUnits / (MM_BOOK_LEVELS * 2));
  const perLevel = Math.min(MM_TARGET_LEVEL_SIZE, maxPerLevel);

  if (perLevel < 1) {
    fail(
      "Demo funding",
      `at least ${formatUsdc(BigInt((DEMO_TRADER_USDC + MM_BOOK_LEVELS * 2) * ONE_USDC))} total to preserve trader reserve and quote both sides`,
      `${formatUsdc(traderUsdcBalance + mmUsdcBalance)} available`,
    );
  }

  const actualMintPairs = MM_BOOK_LEVELS * perLevel;
  const bidLevels = MM_BID_PRICES.map((price) => ({ price, size: BigInt(perLevel) }));
  const askLevels = MM_ASK_PRICES.map((price) => ({ price, size: BigInt(perLevel) }));
  const mmTargetUsdc = BigInt(actualMintPairs + MM_BOOK_LEVELS * perLevel) * BigInt(ONE_USDC);

  return {
    actualMintPairs,
    perLevel,
    bidLevels,
    askLevels,
    mmTargetUsdc,
  };
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

async function ensurePhoenixSeat(
  connection: Connection,
  phoenixMarket: PublicKey,
  marketAuthority: Keypair,
  trader: Keypair,
): Promise<PublicKey> {
  const seatPubkey = getSeatAddress(phoenixMarket, trader.publicKey);
  const seatAcct = await connection.getAccountInfo(seatPubkey);
  if (seatAcct && seatAcct.data.length > 0) {
    return seatPubkey;
  }

  const requestIx = createRequestSeatInstruction({
    phoenixProgram: PHOENIX_PROGRAM_ID,
    logAuthority: getLogAuthority(),
    market: phoenixMarket,
    payer: trader.publicKey,
    seat: seatPubkey,
  });
  const approveIx = buildApproveSeatIx(
    phoenixMarket,
    marketAuthority.publicKey,
    seatPubkey,
  );
  const seatTx = new Transaction().add(requestIx, approveIx);
  const signers =
    trader.publicKey.equals(marketAuthority.publicKey)
      ? [marketAuthority]
      : [trader, marketAuthority];
  const seatSig = await connection.sendTransaction(seatTx, signers);
  await connection.confirmTransaction(seatSig, "confirmed");
  return seatPubkey;
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
  const marketMaker = loadKeypair(DEMO_MARKET_MAKER_KEYPAIR_PATH);
  const programId = new PublicKey(programIdStr);

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = await loadIdl(programId, provider);
  const program = new anchor.Program(idl, provider);
  const [configPda] = deriveConfigPda(programId);

  result("Payer", payer.publicKey.toBase58());
  result("Market maker", marketMaker.publicKey.toBase58());

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

    for (const [label, trader] of [["Payer", payer], ["MM", marketMaker]] as const) {
      try {
        const cancelIx = createCancelAllOrdersWithFreeFundsInstruction({
          phoenixProgram: PHOENIX_PROGRAM_ID, logAuthority: logAuth,
          market: phoenixMarketAddr, trader: trader.publicKey,
        });
        await connection.sendTransaction(new Transaction().add(cancelIx), [trader]);
        result(`${label} orders`, "cancelled");
      } catch { /* no orders */ }

      try {
        const userYes = await getAssociatedTokenAddress(yesMintPda, trader.publicKey);
        const userUsdc = await getAssociatedTokenAddress(usdcMint, trader.publicKey);
        const withdrawIx = createWithdrawFundsInstruction({
          phoenixProgram: PHOENIX_PROGRAM_ID, logAuthority: logAuth,
          market: phoenixMarketAddr, trader: trader.publicKey,
          baseAccount: userYes, quoteAccount: userUsdc,
          baseVault: phoenixBaseVault, quoteVault: phoenixQuoteVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        }, { withdrawFundsParams: { quoteLotsToWithdraw: null, baseLotsToWithdraw: null } });
        await connection.sendTransaction(new Transaction().add(withdrawIx), [trader]);
        result(`${label} Phoenix`, "funds withdrawn");
      } catch { /* nothing to withdraw */ }
    }

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

    const afterSettle = await (program.account as any).meridianMarket.fetch(m.pda);
    const finalPhase = Object.keys(afterSettle.phase)[0];

    for (const [label, signer] of [["Payer", payer], ["MM", marketMaker]] as const) {
      const userYesAta = await getAssociatedTokenAddress(yesMintPda, signer.publicKey);
      const userNoAta = await getAssociatedTokenAddress(noMintPda, signer.publicKey);
      const userUsdcAta = await getAssociatedTokenAddress(usdcMint, signer.publicKey);

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
          result(`${label} merge`, `${p} pairs -> USDC`);
        }
      } catch { /* nothing to merge */ }

      if (finalPhase === "settled") {
        try {
          const yesBal = (await getAccount(connection, userYesAta)).amount;
          const pairsToRedeem = Number(yesBal) / ONE_USDC;
          if (pairsToRedeem > 0) {
            await (program.methods as any).redeem(new anchor.BN(pairsToRedeem)).accounts({
              user: signer.publicKey, config: configPda, market: m.pda, vault: vaultPda,
              yesMint: yesMintPda, noMint: noMintPda, userUsdc: userUsdcAta,
              userYes: userYesAta, userNo: userNoAta, tokenProgram: TOKEN_PROGRAM_ID,
            }).signers([signer]).rpc();
            result(`${label} redeem`, `${pairsToRedeem} winning tokens`);
          }
        } catch { /* nothing to redeem */ }
      }
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
  const marketMaker = loadKeypair(DEMO_MARKET_MAKER_KEYPAIR_PATH);
  const programId = new PublicKey(programIdStr);
  const pythReceiver = new PublicKey(pythReceiverStr);

  const version = await connection.getVersion();
  result("RPC", `${rpcUrl} (solana-core ${version["solana-core"]})`);
  result("Mode", isLocal ? "local validator" : "devnet");
  result("Trader", payer.publicKey.toBase58());
  result("Market maker", marketMaker.publicKey.toBase58());

  // ── Step 2: Ensure SOL balance ──────────────────────────────────────────

  step(2, "Ensure SOL balances");

  let traderBalance = await connection.getBalance(payer.publicKey);
  if (isLocal && traderBalance < 2 * LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    traderBalance = await connection.getBalance(payer.publicKey);
    result("Trader airdrop", "5 SOL");
  }
  if (isLocal) {
    let mmBalance = await connection.getBalance(marketMaker.publicKey);
    if (mmBalance < 2 * LAMPORTS_PER_SOL) {
      const sig = await connection.requestAirdrop(marketMaker.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      mmBalance = await connection.getBalance(marketMaker.publicKey);
      result("MM airdrop", "5 SOL");
    }
    result("MM balance", `${mmBalance / LAMPORTS_PER_SOL} SOL`);
  }
  if (traderBalance < 0.5 * LAMPORTS_PER_SOL) {
    fail("Trader SOL balance", ">= 0.5 SOL", `${traderBalance / LAMPORTS_PER_SOL} SOL`);
  }
  result("Trader balance", `${traderBalance / LAMPORTS_PER_SOL} SOL`);

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

  // ── Step 5: Fund trader + market maker ─────────────────────────────────

  step(5, "Fund trader and market maker");

  const payerUsdcAta = await getOrCreateAta(connection, payer, usdcMint, payer.publicKey);
  const mmUsdcAta = await getOrCreateAta(connection, payer, usdcMint, marketMaker.publicKey);
  let traderUsdcBalance: bigint;
  try {
    traderUsdcBalance = (await getAccount(connection, payerUsdcAta)).amount;
  } catch {
    traderUsdcBalance = 0n;
  }
  const traderTargetUsdc = BigInt(DEMO_TRADER_USDC * ONE_USDC);
  result("Trader USDC", formatUsdc(traderUsdcBalance));
  result("Trader target", formatUsdc(traderTargetUsdc));

  if (traderUsdcBalance < traderTargetUsdc) {
    const deficit = traderTargetUsdc - traderUsdcBalance;
    try {
      await mintTo(connection, payer, usdcMint, payerUsdcAta, payer.publicKey, deficit);
      traderUsdcBalance = (await getAccount(connection, payerUsdcAta)).amount;
      result("Minted trader USDC", formatUsdc(deficit));
    } catch {
      let mmUsdcBalance: bigint;
      try {
        mmUsdcBalance = (await getAccount(connection, mmUsdcAta)).amount;
      } catch {
        mmUsdcBalance = 0n;
      }

      if (mmUsdcBalance >= deficit) {
        const transferIx = createTransferInstruction(
          mmUsdcAta,
          payerUsdcAta,
          marketMaker.publicKey,
          deficit,
        );
        const transferSig = await connection.sendTransaction(
          new Transaction().add(transferIx),
          [marketMaker],
        );
        await connection.confirmTransaction(transferSig, "confirmed");
        traderUsdcBalance = (await getAccount(connection, payerUsdcAta)).amount;
        result("Transferred trader USDC", formatUsdc(deficit));
      } else {
        result(
          "Trader funding",
          "payer is not USDC mint authority and MM does not hold enough USDC to top up the browser wallet",
        );
      }
    }
  }

  if (traderUsdcBalance < traderTargetUsdc) {
    fail(
      "Trader funding",
      `${formatUsdc(traderTargetUsdc)} in the browser wallet`,
      `${formatUsdc(traderUsdcBalance)} after mint/transfer attempts`,
    );
  }
  result("Trader funded", formatUsdc(traderUsdcBalance));

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

  // ── Step 8: Request + approve trader + MM seats ────────────────────────

  step(8, "Request and approve Phoenix seats");

  const traderSeatPubkey = await ensurePhoenixSeat(
    connection,
    phoenixMarketAddr!,
    payer,
    payer,
  );
  const mmSeatPubkey = await ensurePhoenixSeat(
    connection,
    phoenixMarketAddr!,
    payer,
    marketMaker,
  );
  result("Trader seat", traderSeatPubkey.toBase58());
  result("MM seat", mmSeatPubkey.toBase58());

  // ── Step 9: Create token accounts ─────────────────────────────────────

  step(9, "Create trader + MM token accounts");

  const userYesAta = await getOrCreateAta(connection, payer, yesMintPda, payer.publicKey);
  const userNoAta = await getOrCreateAta(connection, payer, noMintPda, payer.publicKey);
  const mmYesAta = await getOrCreateAta(connection, payer, yesMintPda, marketMaker.publicKey);
  const mmNoAta = await getOrCreateAta(connection, payer, noMintPda, marketMaker.publicKey);

  result("Trader USDC ATA", payerUsdcAta.toBase58());
  result("Trader Yes ATA", userYesAta.toBase58());
  result("Trader No ATA", userNoAta.toBase58());
  result("MM USDC ATA", mmUsdcAta.toBase58());
  result("MM Yes ATA", mmYesAta.toBase58());
  result("MM No ATA", mmNoAta.toBase58());

  // ── Step 10: Fund MM + mint liquidity pairs ────────────────────────────

  const [phoenixBaseVault] = derivePhoenixVault(phoenixMarketAddr!, yesMintPda);
  const [phoenixQuoteVault] = derivePhoenixVault(phoenixMarketAddr!, usdcMint);

  let mmUsdcBalance: bigint;
  try {
    mmUsdcBalance = (await getAccount(connection, mmUsdcAta)).amount;
  } catch {
    mmUsdcBalance = 0n;
  }

  const {
    actualMintPairs,
    perLevel,
    bidLevels,
    askLevels,
    mmTargetUsdc,
  } = buildLiquidityPlan(traderUsdcBalance, traderTargetUsdc, mmUsdcBalance);

  step(10, `Fund MM and mint ${actualMintPairs} Yes/No pairs for liquidity`);
  result("MM current USDC", formatUsdc(mmUsdcBalance));
  result("MM target USDC", formatUsdc(mmTargetUsdc));
  result("Book depth", `${perLevel} token(s) at each of ${MM_BOOK_LEVELS} bid/ask levels`);

  if (mmUsdcBalance < mmTargetUsdc) {
    const deficit = mmTargetUsdc - mmUsdcBalance;
    let funded = false;
    try {
      await mintTo(connection, payer, usdcMint, mmUsdcAta, payer.publicKey, deficit);
      funded = true;
      result("Minted MM USDC", formatUsdc(deficit));
    } catch {
      // On devnet the payer is not the mint authority. Fall back to transferring
      // enough USDC from the trader wallet if available.
    }
    if (!funded) {
      const traderUsdc = (await getAccount(connection, payerUsdcAta)).amount;
      const spendableTraderUsdc =
        traderUsdc > traderTargetUsdc ? traderUsdc - traderTargetUsdc : 0n;
      if (spendableTraderUsdc < deficit) {
        fail(
          "MM funding",
          `${formatUsdc(deficit)} available above the trader reserve`,
          `${formatUsdc(spendableTraderUsdc)} spendable while preserving ${formatUsdc(traderTargetUsdc)} for the browser wallet`,
        );
      }
      const transferIx = createTransferInstruction(
        payerUsdcAta,
        mmUsdcAta,
        payer.publicKey,
        deficit,
      );
      const transferSig = await connection.sendTransaction(
        new Transaction().add(transferIx),
        [payer],
      );
      await connection.confirmTransaction(transferSig, "confirmed");
      result("Transferred MM USDC", formatUsdc(deficit));
      traderUsdcBalance = (await getAccount(connection, payerUsdcAta)).amount;
    }
    mmUsdcBalance = (await getAccount(connection, mmUsdcAta)).amount;
  }

  const mintSig = await (program.methods as any)
    .mintPair(new anchor.BN(actualMintPairs))
    .accounts({
      user: marketMaker.publicKey,
      config: configPda,
      market: marketPda,
      vault: vaultPda,
      yesMint: yesMintPda,
      noMint: noMintPda,
      userUsdc: mmUsdcAta,
      userYes: mmYesAta,
      userNo: mmNoAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([marketMaker])
    .rpc();
  result("MM minted", `${actualMintPairs} pairs (${actualMintPairs} USDC deposited)`);
  result("Tx", explorerUrl(mintSig));

  // ── Step 11: Place resting orders (liquidity for all 4 trade paths) ────

  step(11, "Place MM resting orders on Phoenix (bids + asks)");

  // Place bids
  for (const level of bidLevels) {
    const ix = buildPlaceLimitOrderIx(
      phoenixMarketAddr!, marketMaker.publicKey, mmSeatPubkey,
      phoenixBaseVault, phoenixQuoteVault,
      mmYesAta, mmUsdcAta,
      "bid", level.price, level.size * BigInt(BASE_LOTS_PER_TOKEN),
    );
    const sig = await connection.sendTransaction(new Transaction().add(ix), [marketMaker]);
    await connection.confirmTransaction(sig, "confirmed");
    result(`Bid @${level.price}`, `${level.size} Yes`);
  }

  // Place asks
  for (const level of askLevels) {
    const ix = buildPlaceLimitOrderIx(
      phoenixMarketAddr!, marketMaker.publicKey, mmSeatPubkey,
      phoenixBaseVault, phoenixQuoteVault,
      mmYesAta, mmUsdcAta,
      "ask", level.price, level.size * BigInt(BASE_LOTS_PER_TOKEN),
    );
    const sig = await connection.sendTransaction(new Transaction().add(ix), [marketMaker]);
    await connection.confirmTransaction(sig, "confirmed");
    result(`Ask @${level.price}`, `${level.size} Yes`);
  }

  // ── Step 12: Summary ──────────────────────────────────────────────────

  step(12, "Seed complete — ready for browser demo");

  const vaultBal = (await getAccount(connection, vaultPda)).amount;
  const yesBal = (await getAccount(connection, userYesAta)).amount;
  const noBal = (await getAccount(connection, userNoAta)).amount;
  const finalUsdc = (await getAccount(connection, payerUsdcAta)).amount;
  const mmUsdcFinal = (await getAccount(connection, mmUsdcAta)).amount;
  const mmYesFinal = (await getAccount(connection, mmYesAta)).amount;

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
  console.log(`    Trader USDC: ${formatUsdc(finalUsdc)}`);
  console.log(`    Trader Yes:  ${formatUsdc(yesBal)}`);
  console.log(`    Trader No:   ${formatUsdc(noBal)}`);
  console.log(`    MM USDC:     ${formatUsdc(mmUsdcFinal)}`);
  console.log(`    MM Yes:      ${formatUsdc(mmYesFinal)}`);
  console.log(`    Vault: ${formatUsdc(vaultBal)}`);
  console.log("");
  console.log("  Order book (Phoenix):");
  console.log("    Bids: @45, @48, @50 (for Buy Yes / Sell No fills)");
  console.log("    Asks: @52, @55, @58 (for Sell Yes / Buy No fills)");
  console.log("");
  console.log("  Demo flow:");
  console.log("    1. Import the trader wallet from ANCHOR_WALLET into Phantom");
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
