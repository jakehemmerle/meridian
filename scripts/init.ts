/**
 * Meridian Config Initialization — Idempotent
 *
 * On local: creates a USDC mint, airdrops SOL, updates .env, then initializes config.
 * On devnet: reads existing USDC mint from env, initializes config.
 * Safe to run multiple times.
 *
 * Usage: pnpm init (local) | pnpm init:devnet
 */

import * as anchor from "@coral-xyz/anchor";
import { createMint, getAssociatedTokenAddress, getAccount, mintTo, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { loadKeypair } from "../automation/src/clients/keypair.js";
import { explorerUrl } from "../automation/src/clients/format.js";
import { deriveConfigPda } from "../automation/src/clients/pda.js";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Meridian Init ===\n");

  // ── Step 1: Read env vars directly (validateBootstrapEnv is too strict for first-run local) ──

  console.log("[1] Environment...");

  const rpcUrl = process.env.SOLANA_RPC_URL;
  const walletPath = process.env.ANCHOR_WALLET;
  const programIdStr = process.env.MERIDIAN_PROGRAM_ID;
  const pythReceiverStr = process.env.MERIDIAN_PYTH_RECEIVER_PROGRAM_ID;

  if (!rpcUrl || !walletPath || !programIdStr || !pythReceiverStr) {
    console.error("  ✗ Missing required env vars: SOLANA_RPC_URL, ANCHOR_WALLET, MERIDIAN_PROGRAM_ID, MERIDIAN_PYTH_RECEIVER_PROGRAM_ID");
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(walletPath);
  const programId = new PublicKey(programIdStr);
  const pythReceiver = new PublicKey(pythReceiverStr);

  console.log(`  ✓ RPC: ${rpcUrl}`);
  console.log(`  ✓ Program: ${programId.toBase58()}`);
  console.log(`  ✓ Payer: ${payer.publicKey.toBase58()}`);

  // ── Step 2: Ensure SOL balance ──────────────────────────────────────────────

  let balance = await connection.getBalance(payer.publicKey);
  const isLocal = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");

  if (isLocal && balance < 2 * LAMPORTS_PER_SOL) {
    console.log("  → Airdropping 5 SOL (local validator)...");
    const sig = await connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    balance = await connection.getBalance(payer.publicKey);
  }

  if (balance < 0.2 * LAMPORTS_PER_SOL) {
    console.error(`  ✗ Insufficient SOL: ${balance / LAMPORTS_PER_SOL} SOL (need ≥0.2)`);
    process.exit(1);
  }
  console.log(`  ✓ Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // ── Step 3: Resolve USDC mint (create if empty on local) ────────────────────

  console.log("\n[2] USDC mint...");

  let usdcMintStr = process.env.MERIDIAN_USDC_MINT ?? "";
  let usdcMint: PublicKey;

  if (usdcMintStr) {
    usdcMint = new PublicKey(usdcMintStr);
    // On local, verify the mint actually exists (validator may have been reset)
    const mintInfo = await connection.getAccountInfo(usdcMint);
    if (mintInfo) {
      console.log(`  ✓ USDC mint (from env): ${usdcMint.toBase58()}`);
    } else if (isLocal) {
      console.log(`  ✗ USDC mint ${usdcMint.toBase58()} not found on-chain (stale from prior validator?)`);
      usdcMintStr = ""; // fall through to create
    } else {
      console.error(`  ✗ USDC mint ${usdcMint.toBase58()} not found on-chain`);
      process.exit(1);
    }
  }

  if (!usdcMintStr && isLocal) {
    console.log("  → Creating USDC mint (local validator)...");
    usdcMint = await createMint(connection, payer, payer.publicKey, null, 6, undefined, undefined, TOKEN_PROGRAM_ID);
    console.log(`  ✓ USDC mint created: ${usdcMint.toBase58()}`);

    // Mint 10,000 USDC to payer for demo use
    const payerAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMint, payer.publicKey);
    await mintTo(connection, payer, usdcMint, payerAta.address, payer.publicKey, 10_000_000_000);
    console.log("  ✓ Minted 10,000 USDC to payer");
    console.log("  ✓ Mint stored in on-chain config (no .env update needed)");
  } else if (!usdcMintStr) {
    console.error("  ✗ MERIDIAN_USDC_MINT is empty and not on local validator — set it in your .env");
    process.exit(1);
  }

  // ── Step 3b: Check USDC balance ────────────────────────────────────────────

  if (!isLocal) {
    try {
      const payerUsdcAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);
      const usdcAccount = await getAccount(connection, payerUsdcAta);
      const usdcBalance = Number(usdcAccount.amount) / 1_000_000;
      if (usdcBalance < 10) {
        console.log(`  ⚠ USDC balance: ${usdcBalance} (need ≥10 for demo)`);
        console.log(`  → Get devnet USDC: https://faucet.circle.com → Solana Devnet → ${payer.publicKey.toBase58()}`);
      } else {
        console.log(`  ✓ USDC balance: ${usdcBalance}`);
      }
    } catch {
      console.log(`  ⚠ No USDC token account found`);
      console.log(`  → Get devnet USDC: https://faucet.circle.com → Solana Devnet → ${payer.publicKey.toBase58()}`);
    }
  }

  // ── Step 4: Set up Anchor provider & program ────────────────────────────────

  console.log("\n[3] Anchor setup...");

  const wallet = new anchor.Wallet(payer);
  const anchorProvider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(anchorProvider);

  let idl = await anchor.Program.fetchIdl(programId, anchorProvider);
  if (!idl) {
    try {
      idl = JSON.parse(readFileSync("target/idl/meridian.json", "utf8"));
      console.log("  ✓ IDL: local file");
    } catch {
      console.error("  ✗ IDL not found on-chain or locally — run `anchor build` first");
      process.exit(1);
    }
  } else {
    console.log("  ✓ IDL: on-chain");
  }
  const program = new anchor.Program(idl, anchorProvider);

  // ── Step 5: Initialize config PDA ───────────────────────────────────────────

  console.log("\n[4] Config PDA...");

  const [configPda] = deriveConfigPda(programId);
  console.log(`  ✓ Config PDA: ${configPda.toBase58()}`);

  const configAccount = await connection.getAccountInfo(configPda);
  if (configAccount && configAccount.data.length > 0) {
    // Verify the on-chain config's USDC mint matches what we expect
    const existingCfg = await (program.account as any).meridianConfig.fetch(configPda);
    if (!existingCfg.usdcMint.equals(usdcMint)) {
      console.error(`  ✗ Config USDC mint mismatch!`);
      console.error(`    On-chain: ${existingCfg.usdcMint.toBase58()}`);
      console.error(`    Expected: ${usdcMint.toBase58()}`);
      console.error(`    If local, restart validator with --reset and re-run setup.`);
      process.exit(1);
    }
    console.log("  ✓ Config already initialized — skipping");
  } else {
    console.log("  → Initializing config...");
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
    console.log(`  ✓ Config initialized: ${explorerUrl(sig)}`);
  }

  // ── Step 6: Print config state ──────────────────────────────────────────────

  console.log("\n[5] Config state:");
  const cfg = await (program.account as any).meridianConfig.fetch(configPda);
  console.log(`  version:                  ${cfg.version}`);
  console.log(`  isPaused:                 ${cfg.isPaused}`);
  console.log(`  oracleMaximumAgeSeconds:  ${cfg.oracleMaximumAgeSeconds}`);
  console.log(`  oracleConfidenceLimitBps: ${cfg.oracleConfidenceLimitBps}`);
  console.log(`  adminAuthority:           ${cfg.adminAuthority.toBase58()}`);
  console.log(`  operationsAuthority:      ${cfg.operationsAuthority.toBase58()}`);
  console.log(`  usdcMint:                 ${cfg.usdcMint.toBase58()}`);
  console.log(`  pythReceiverProgram:      ${cfg.pythReceiverProgram.toBase58()}`);

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log("\n[6] Summary:");
  console.log(`  Config PDA:     ${configPda.toBase58()}`);
  console.log(`  Admin:          ${cfg.adminAuthority.toBase58()}`);
  console.log(`  Program ID:     ${programId.toBase58()}`);
  console.log(`  USDC Mint:      ${cfg.usdcMint.toBase58()}`);
  console.log(`  SOL Balance:    ${balance / LAMPORTS_PER_SOL} SOL`);
  if (!isLocal) {
    try {
      const payerUsdcAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);
      const usdcAccount = await getAccount(connection, payerUsdcAta);
      console.log(`  USDC Balance:   ${Number(usdcAccount.amount) / 1_000_000}`);
    } catch {
      console.log(`  USDC Balance:   0`);
    }
  }

  console.log("\n=== Done ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
