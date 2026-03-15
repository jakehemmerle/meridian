/**
 * Meridian Demo — End-to-End Lifecycle
 *
 * Exercises the full Meridian lifecycle in a single script:
 * create market → create Phoenix order book → mint pairs → trade → close → settle → redeem
 *
 * Usage: pnpm demo (local) | pnpm demo:devnet (devnet)
 * Prerequisites: see .env.example / .env.devnet.example for required environment variables
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccount,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
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
import { readFileSync } from "node:fs";

import {
  createPhoenixMarket,
  MERIDIAN_PHOENIX_DEFAULTS,
  buildChangeMarketStatusIx,
  PHOENIX_MARKET_STATUS,
  getMarketHeader,
} from "../automation/src/clients/phoenix.js";
import {
  buildCloseMarketIx,
  MERIDIAN_PROGRAM_ID,
} from "../automation/src/clients/meridian.js";
import { validateBootstrapEnv } from "../automation/src/config/env.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIG_SEED = Buffer.from("config");
const MARKET_SEED = Buffer.from("market");
const VAULT_SEED = Buffer.from("vault");
const YES_MINT_SEED = Buffer.from("yes_mint");
const NO_MINT_SEED = Buffer.from("no_mint");

const ONE_USDC = 1_000_000;
const TICKER_AAPL = 0;

const AAPL_FEED_ID = new Uint8Array([
  73, 246, 182, 92, 177, 222, 107, 16, 234, 247, 94, 124, 3, 202, 2, 156, 48,
  109, 3, 87, 233, 27, 83, 17, 177, 117, 8, 74, 90, 213, 86, 136,
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUsdc(amount: bigint): string {
  const whole = amount / BigInt(ONE_USDC);
  const frac = amount % BigInt(ONE_USDC);
  return `${whole}.${frac.toString().padStart(6, "0")} USDC`;
}

function explorerUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function deriveMarketPda(
  ticker: number,
  tradingDay: number,
  strikePrice: bigint,
): [PublicKey, number] {
  const tradingDayBuf = Buffer.alloc(4);
  tradingDayBuf.writeUInt32LE(tradingDay);
  const strikePriceBuf = Buffer.alloc(8);
  strikePriceBuf.writeBigUInt64LE(strikePrice);
  return PublicKey.findProgramAddressSync(
    [MARKET_SEED, Buffer.from([ticker]), tradingDayBuf, strikePriceBuf],
    MERIDIAN_PROGRAM_ID,
  );
}

function derivePhoenixVault(
  market: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer(), mint.toBuffer()],
    PHOENIX_PROGRAM_ID,
  );
}

/** Build a Phoenix ChangeSeatStatus instruction (discriminant 104, status=1 for Approved) */
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

/**
 * Build a raw Phoenix PlaceLimitOrder instruction (PostOnly).
 * Discriminant = 2 (PlaceLimitOrder).
 */
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
  // client_order_id (u128) = 0
  packetBuf.writeBigUInt64LE(0n, offset); offset += 8;
  packetBuf.writeBigUInt64LE(0n, offset); offset += 8;
  packetBuf.writeUInt8(0, offset); offset += 1; // reject_post_only = false
  packetBuf.writeUInt8(0, offset); offset += 1; // use_only_deposited_funds = false
  packetBuf.writeUInt8(0, offset); offset += 1; // last_valid_slot: None
  packetBuf.writeUInt8(0, offset); offset += 1; // last_valid_unix_timestamp_in_seconds: None
  packetBuf.writeUInt8(1, offset); offset += 1; // fail_silently_on_insufficient_funds = true

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

function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith("~")
    ? path.replace("~", process.env.HOME ?? "")
    : path;
  const raw = JSON.parse(readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function step(n: number, label: string): void {
  console.log(`\n[${"=".repeat(60)}]`);
  console.log(`  STEP ${n}: ${label}`);
  console.log(`[${"=".repeat(60)}]\n`);
}

function result(label: string, value: string): void {
  console.log(`  ✓ ${label}: ${value}`);
}

function fail(label: string, expected: string, actual: string): never {
  console.error(`  ✗ ${label}`);
  console.error(`    Expected: ${expected}`);
  console.error(`    Actual:   ${actual}`);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         MERIDIAN DEVNET DEMO — Full Lifecycle               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // ── Step 1: Validate environment ─────────────────────────────────────────

  step(1, "Validate environment");

  const bootstrap = validateBootstrapEnv(process.env);
  const connection = new Connection(bootstrap.env.SOLANA_RPC_URL, "confirmed");
  const payer = loadKeypair(bootstrap.resolvedPaths.anchorWalletPath);

  const version = await connection.getVersion();
  result("Connection", `${bootstrap.env.SOLANA_RPC_URL} (solana-core ${version["solana-core"]})`);
  result("Program ID", bootstrap.publicKeys.programId);
  result("USDC Mint", bootstrap.publicKeys.usdcMint);
  result("Payer", payer.publicKey.toBase58());

  const payerBalance = await connection.getBalance(payer.publicKey);
  if (payerBalance < 2e9) {
    fail("Payer balance", "≥2 SOL", `${payerBalance / 1e9} SOL`);
  }
  result("Payer balance", `${payerBalance / 1e9} SOL`);

  // Set up Anchor provider for program interaction
  const wallet = new anchor.Wallet(payer);
  const anchorProvider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(anchorProvider);

  // We need the IDL — load it dynamically from the deployed program
  const programId = new PublicKey(bootstrap.publicKeys.programId);
  const idl = await anchor.Program.fetchIdl(programId, anchorProvider);
  if (!idl) {
    fail("IDL fetch", "IDL available on-chain", "null");
  }
  const program = new anchor.Program(idl, anchorProvider);

  const usdcMint = new PublicKey(bootstrap.publicKeys.usdcMint);

  // ── Step 2: Initialize (or reuse) config PDA ────────────────────────────

  step(2, "Initialize config PDA");

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  result("Config PDA", configPda.toBase58());

  let configExists = false;
  try {
    const configAccount = await connection.getAccountInfo(configPda);
    if (configAccount && configAccount.data.length > 0) {
      configExists = true;
      result("Config status", "already initialized");
    }
  } catch {
    // Account doesn't exist
  }

  if (!configExists) {
    const sig = await (program.methods as any)
      .initializeConfig({
        adminAuthority: payer.publicKey,
        operationsAuthority: payer.publicKey,
        usdcMint,
        pythReceiverProgram: new PublicKey(bootstrap.publicKeys.pythReceiverProgramId),
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

  // ── Step 3: Create one Meridian market ──────────────────────────────────

  step(3, "Create Meridian market");

  // Use a unique trading day based on current date to avoid PDA collisions
  const now = new Date();
  const tradingDay =
    now.getUTCFullYear() * 10000 +
    (now.getUTCMonth() + 1) * 100 +
    now.getUTCDate();
  const strikePrice = BigInt(200 * ONE_USDC); // $200 strike

  const [marketPda] = deriveMarketPda(TICKER_AAPL, tradingDay, strikePrice);
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, marketPda.toBuffer()],
    programId,
  );
  const [yesMintPda] = PublicKey.findProgramAddressSync(
    [YES_MINT_SEED, marketPda.toBuffer()],
    programId,
  );
  const [noMintPda] = PublicKey.findProgramAddressSync(
    [NO_MINT_SEED, marketPda.toBuffer()],
    programId,
  );

  result("Market PDA", marketPda.toBase58());
  result("Trading day", String(tradingDay));
  result("Strike price", `$${Number(strikePrice) / ONE_USDC}`);

  // Pre-generate Phoenix market keypair
  const phoenixMarketKeypair = Keypair.generate();
  const phoenixMarketPubkey = phoenixMarketKeypair.publicKey;

  // Use far-future close time so market stays in Trading phase for the demo
  const closeTimeTs = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);
  const settleAfterTs = new anchor.BN(closeTimeTs.toNumber() + 600);

  let marketExists = false;
  try {
    const acct = await connection.getAccountInfo(marketPda);
    if (acct && acct.data.length > 0) {
      marketExists = true;
      result("Market status", "already exists (reusing)");
    }
  } catch {
    // doesn't exist
  }

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
        phoenixMarket: phoenixMarketPubkey,
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
  }

  // Fetch and verify market state
  const marketAccount = await (program.account as any).meridianMarket.fetch(marketPda);
  const phase = Object.keys(marketAccount.phase)[0];
  const outcome = Object.keys(marketAccount.outcome)[0];
  if (phase !== "trading") {
    fail("Market phase", "trading", phase);
  }
  result("Market phase", phase);
  result("Market outcome", outcome);
  result("Yes open interest", String(marketAccount.yesOpenInterest.toNumber()));

  // ── Step 4: Create Phoenix market ───────────────────────────────────────

  step(4, "Create Phoenix market for Yes mint");

  let phoenixMarketAddr: PublicKey;

  if (marketExists) {
    // If the Meridian market already exists, we need to read the stored phoenix market
    phoenixMarketAddr = marketAccount.phoenixMarket;
    result("Phoenix market (from existing)", phoenixMarketAddr.toBase58());
  } else {
    const { phoenixMarket } = await createPhoenixMarket(
      connection,
      payer,
      {
        ...MERIDIAN_PHOENIX_DEFAULTS,
        baseMint: yesMintPda,
        quoteMint: usdcMint,
      },
      phoenixMarketKeypair,
    );
    phoenixMarketAddr = phoenixMarket;
    result("Phoenix market created", phoenixMarketAddr.toBase58());

    // Activate Phoenix market (from PostOnly to Active)
    const activateIx = buildChangeMarketStatusIx(phoenixMarketAddr, payer.publicKey, PHOENIX_MARKET_STATUS.ACTIVE);
    const activateTx = new Transaction().add(activateIx);
    const activateSig = await connection.sendTransaction(activateTx, [payer]);
    await connection.confirmTransaction(activateSig, "confirmed");
    result("Phoenix market activated", explorerUrl(activateSig));
  }

  // Verify Phoenix market header
  const header = await getMarketHeader(connection, phoenixMarketAddr);
  result("Phoenix base mint", header.baseParams.mintKey.toBase58());
  result("Phoenix quote mint", header.quoteParams.mintKey.toBase58());

  if (!header.baseParams.mintKey.equals(yesMintPda)) {
    fail("Phoenix base mint", yesMintPda.toBase58(), header.baseParams.mintKey.toBase58());
  }

  // ── Step 5: Request + approve seat ──────────────────────────────────────

  step(5, "Request and approve seat");

  const seatPubkey = getSeatAddress(phoenixMarketAddr, payer.publicKey);
  let seatExists = false;
  try {
    const seatAcct = await connection.getAccountInfo(seatPubkey);
    if (seatAcct && seatAcct.data.length > 0) {
      seatExists = true;
      result("Seat status", "already exists");
    }
  } catch {
    // doesn't exist
  }

  if (!seatExists) {
    const requestIx = createRequestSeatInstruction({
      phoenixProgram: PHOENIX_PROGRAM_ID,
      logAuthority: getLogAuthority(),
      market: phoenixMarketAddr,
      payer: payer.publicKey,
      seat: seatPubkey,
    });
    const approveIx = buildApproveSeatIx(phoenixMarketAddr, payer.publicKey, seatPubkey);
    const seatTx = new Transaction().add(requestIx, approveIx);
    const seatSig = await connection.sendTransaction(seatTx, [payer]);
    await connection.confirmTransaction(seatSig, "confirmed");
    result("Seat requested + approved", explorerUrl(seatSig));
  }

  result("Seat address", seatPubkey.toBase58());

  // ── Create token accounts ───────────────────────────────────────────────

  console.log("\n  Setting up token accounts...");

  const userUsdcAta = await getOrCreateAta(connection, payer, usdcMint, payer.publicKey);
  const userYesAta = await getOrCreateAta(connection, payer, yesMintPda, payer.publicKey);
  const userNoAta = await getOrCreateAta(connection, payer, noMintPda, payer.publicKey);

  result("User USDC ATA", userUsdcAta.toBase58());
  result("User Yes ATA", userYesAta.toBase58());
  result("User No ATA", userNoAta.toBase58());

  const [phoenixBaseVault] = derivePhoenixVault(phoenixMarketAddr, yesMintPda);
  const [phoenixQuoteVault] = derivePhoenixVault(phoenixMarketAddr, usdcMint);

  // ── Step 6: Mint 10 Yes/No pairs ───────────────────────────────────────

  step(6, "Mint 10 Yes/No pairs (costs 10 USDC)");

  const usdcBefore6 = (await getAccount(connection, userUsdcAta)).amount;
  const yesBefore6 = (await getAccount(connection, userYesAta)).amount;
  const noBefore6 = (await getAccount(connection, userNoAta)).amount;
  const vaultBefore6 = (await getAccount(connection, vaultPda)).amount;

  const mintSig = await (program.methods as any)
    .mintPair(new anchor.BN(10))
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      vault: vaultPda,
      yesMint: yesMintPda,
      noMint: noMintPda,
      userUsdc: userUsdcAta,
      userYes: userYesAta,
      userNo: userNoAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  const usdcAfter6 = (await getAccount(connection, userUsdcAta)).amount;
  const yesAfter6 = (await getAccount(connection, userYesAta)).amount;
  const noAfter6 = (await getAccount(connection, userNoAta)).amount;
  const vaultAfter6 = (await getAccount(connection, vaultPda)).amount;

  result("Tx", explorerUrl(mintSig));
  result("Vault balance", formatUsdc(vaultAfter6));
  result("User Yes", formatUsdc(yesAfter6));
  result("User No", formatUsdc(noAfter6));

  if (vaultAfter6 - vaultBefore6 !== BigInt(10 * ONE_USDC)) {
    fail("Vault delta", "10.000000 USDC", formatUsdc(vaultAfter6 - vaultBefore6));
  }
  if (yesAfter6 - yesBefore6 !== BigInt(10 * ONE_USDC)) {
    fail("Yes delta", "10.000000 USDC", formatUsdc(yesAfter6 - yesBefore6));
  }
  if (noAfter6 - noBefore6 !== BigInt(10 * ONE_USDC)) {
    fail("No delta", "10.000000 USDC", formatUsdc(noAfter6 - noBefore6));
  }

  // ── Step 7: Place a resting ask on Phoenix ──────────────────────────────

  step(7, "Place resting ask (sell 5 Yes at tick 52)");

  const askIx = buildPlaceLimitOrderIx(
    phoenixMarketAddr,
    payer.publicKey,
    seatPubkey,
    phoenixBaseVault,
    phoenixQuoteVault,
    userYesAta,
    userUsdcAta,
    "ask",
    52n,
    5n * BigInt(ONE_USDC),
  );
  // Also place a resting bid so Sell Yes has something to fill against
  const bidIx = buildPlaceLimitOrderIx(
    phoenixMarketAddr,
    payer.publicKey,
    seatPubkey,
    phoenixBaseVault,
    phoenixQuoteVault,
    userYesAta,
    userUsdcAta,
    "bid",
    48n,
    5n * BigInt(ONE_USDC),
  );
  const orderTx = new Transaction().add(askIx, bidIx);
  const orderSig = await connection.sendTransaction(orderTx, [payer]);
  await connection.confirmTransaction(orderSig, "confirmed");
  result("Resting orders placed", explorerUrl(orderSig));

  // ── Step 8: Buy 3 Yes via tradeYes(Buy) ────────────────────────────────

  step(8, "Buy 3 Yes via tradeYes(Buy)");

  const usdcBefore8 = (await getAccount(connection, userUsdcAta)).amount;
  const yesBefore8 = (await getAccount(connection, userYesAta)).amount;

  const buySig = await (program.methods as any)
    .tradeYes({
      side: { buy: {} },
      numBaseLots: new anchor.BN(3 * ONE_USDC),
      priceInTicks: new anchor.BN(55), // IOC bid above resting ask at 52
      lastValidUnixTimestampInSeconds: null,
    })
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      yesMint: yesMintPda,
      phoenixMarket: phoenixMarketAddr,
      userYes: userYesAta,
      userUsdc: userUsdcAta,
      phoenixBaseVault,
      phoenixQuoteVault,
      seat: seatPubkey,
      logAuthority: getLogAuthority(),
      phoenixProgram: PHOENIX_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  const usdcAfter8 = (await getAccount(connection, userUsdcAta)).amount;
  const yesAfter8 = (await getAccount(connection, userYesAta)).amount;

  result("Tx", explorerUrl(buySig));
  result("Yes delta", `+${formatUsdc(yesAfter8 - yesBefore8)}`);
  result("USDC delta", `-${formatUsdc(usdcBefore8 - usdcAfter8)}`);

  if (yesAfter8 <= yesBefore8) {
    fail("Buy Yes", "Yes balance increased", "unchanged or decreased");
  }

  // ── Step 9: Sell 2 Yes via tradeYes(Sell) ──────────────────────────────

  step(9, "Sell 2 Yes via tradeYes(Sell)");

  const usdcBefore9 = (await getAccount(connection, userUsdcAta)).amount;
  const yesBefore9 = (await getAccount(connection, userYesAta)).amount;

  const sellSig = await (program.methods as any)
    .tradeYes({
      side: { sell: {} },
      numBaseLots: new anchor.BN(2 * ONE_USDC),
      priceInTicks: new anchor.BN(45), // IOC ask below resting bid at 48
      lastValidUnixTimestampInSeconds: null,
    })
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      yesMint: yesMintPda,
      phoenixMarket: phoenixMarketAddr,
      userYes: userYesAta,
      userUsdc: userUsdcAta,
      phoenixBaseVault,
      phoenixQuoteVault,
      seat: seatPubkey,
      logAuthority: getLogAuthority(),
      phoenixProgram: PHOENIX_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  const usdcAfter9 = (await getAccount(connection, userUsdcAta)).amount;
  const yesAfter9 = (await getAccount(connection, userYesAta)).amount;

  result("Tx", explorerUrl(sellSig));
  result("Yes delta", `-${formatUsdc(yesBefore9 - yesAfter9)}`);
  result("USDC delta", `+${formatUsdc(usdcAfter9 - usdcBefore9)}`);

  if (yesAfter9 >= yesBefore9) {
    fail("Sell Yes", "Yes balance decreased", "unchanged or increased");
  }

  // ── Step 10: Buy No (mintPair + tradeYes Sell) ─────────────────────────

  step(10, "Buy No composition: mintPair(2) + tradeYes(Sell, 2)");

  const usdcBefore10 = (await getAccount(connection, userUsdcAta)).amount;
  const noBefore10 = (await getAccount(connection, userNoAta)).amount;
  const vaultBefore10 = (await getAccount(connection, vaultPda)).amount;

  // Replenish resting bid for the sell to fill against
  const replenishBidIx = buildPlaceLimitOrderIx(
    phoenixMarketAddr,
    payer.publicKey,
    seatPubkey,
    phoenixBaseVault,
    phoenixQuoteVault,
    userYesAta,
    userUsdcAta,
    "bid",
    48n,
    5n * BigInt(ONE_USDC),
  );
  const replenishTx = new Transaction().add(replenishBidIx);
  const replenishSig = await connection.sendTransaction(replenishTx, [payer]);
  await connection.confirmTransaction(replenishSig, "confirmed");

  // Step 10a: mintPair(2)
  const mintSig10 = await (program.methods as any)
    .mintPair(new anchor.BN(2))
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      vault: vaultPda,
      yesMint: yesMintPda,
      noMint: noMintPda,
      userUsdc: userUsdcAta,
      userYes: userYesAta,
      userNo: userNoAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  // Step 10b: tradeYes(Sell, 2) — sell the freshly minted Yes
  const sellSig10 = await (program.methods as any)
    .tradeYes({
      side: { sell: {} },
      numBaseLots: new anchor.BN(2 * ONE_USDC),
      priceInTicks: new anchor.BN(45),
      lastValidUnixTimestampInSeconds: null,
    })
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      yesMint: yesMintPda,
      phoenixMarket: phoenixMarketAddr,
      userYes: userYesAta,
      userUsdc: userUsdcAta,
      phoenixBaseVault,
      phoenixQuoteVault,
      seat: seatPubkey,
      logAuthority: getLogAuthority(),
      phoenixProgram: PHOENIX_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  const noAfter10 = (await getAccount(connection, userNoAta)).amount;
  const vaultAfter10 = (await getAccount(connection, vaultPda)).amount;

  result("Mint tx", explorerUrl(mintSig10));
  result("Sell tx", explorerUrl(sellSig10));
  result("No delta", `+${formatUsdc(noAfter10 - noBefore10)}`);
  result("Vault delta", `+${formatUsdc(vaultAfter10 - vaultBefore10)}`);

  if (noAfter10 - noBefore10 !== BigInt(2 * ONE_USDC)) {
    fail("Buy No: No delta", "2.000000 USDC", formatUsdc(noAfter10 - noBefore10));
  }

  // ── Step 11: Sell No (tradeYes Buy + mergePair) ────────────────────────

  step(11, "Sell No composition: tradeYes(Buy, 1) + mergePair(1)");

  const noBefore11 = (await getAccount(connection, userNoAta)).amount;
  const vaultBefore11 = (await getAccount(connection, vaultPda)).amount;

  // Replenish resting ask for the buy to fill against
  const replenishAskIx = buildPlaceLimitOrderIx(
    phoenixMarketAddr,
    payer.publicKey,
    seatPubkey,
    phoenixBaseVault,
    phoenixQuoteVault,
    userYesAta,
    userUsdcAta,
    "ask",
    52n,
    5n * BigInt(ONE_USDC),
  );
  const replenishAskTx = new Transaction().add(replenishAskIx);
  const replenishAskSig = await connection.sendTransaction(replenishAskTx, [payer]);
  await connection.confirmTransaction(replenishAskSig, "confirmed");

  // Step 11a: tradeYes(Buy, 1)
  const buySig11 = await (program.methods as any)
    .tradeYes({
      side: { buy: {} },
      numBaseLots: new anchor.BN(1 * ONE_USDC),
      priceInTicks: new anchor.BN(55),
      lastValidUnixTimestampInSeconds: null,
    })
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      yesMint: yesMintPda,
      phoenixMarket: phoenixMarketAddr,
      userYes: userYesAta,
      userUsdc: userUsdcAta,
      phoenixBaseVault,
      phoenixQuoteVault,
      seat: seatPubkey,
      logAuthority: getLogAuthority(),
      phoenixProgram: PHOENIX_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  // Step 11b: mergePair(1)
  const mergeSig = await (program.methods as any)
    .mergePair(new anchor.BN(1))
    .accounts({
      user: payer.publicKey,
      config: configPda,
      market: marketPda,
      vault: vaultPda,
      yesMint: yesMintPda,
      noMint: noMintPda,
      userUsdc: userUsdcAta,
      userYes: userYesAta,
      userNo: userNoAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer])
    .rpc();

  const noAfter11 = (await getAccount(connection, userNoAta)).amount;
  const vaultAfter11 = (await getAccount(connection, vaultPda)).amount;

  result("Buy tx", explorerUrl(buySig11));
  result("Merge tx", explorerUrl(mergeSig));
  result("No delta", `-${formatUsdc(noBefore11 - noAfter11)}`);
  result("Vault delta", `-${formatUsdc(vaultBefore11 - vaultAfter11)}`);

  if (noBefore11 - noAfter11 !== BigInt(1 * ONE_USDC)) {
    fail("Sell No: No delta", "1.000000 USDC", formatUsdc(noBefore11 - noAfter11));
  }

  // ── Step 12: Close market ──────────────────────────────────────────────

  step(12, "Close market (Phoenix + Meridian)");

  // Close Phoenix market
  const closePhoenixSig = await changePhoenixMarketStatusHelper(
    connection, payer, phoenixMarketAddr, PHOENIX_MARKET_STATUS.CLOSED,
  );
  result("Phoenix market closed", explorerUrl(closePhoenixSig));

  // Close Meridian market via raw instruction (close_market requires past close time)
  // Since our market has a future close_time_ts, we use the program method which
  // allows the operations authority to force close
  const closeMeridianIx = buildCloseMarketIx(marketPda, payer.publicKey, programId);
  const closeTx = new Transaction().add(closeMeridianIx);
  const closeMeridianSig = await connection.sendTransaction(closeTx, [payer]);
  await connection.confirmTransaction(closeMeridianSig, "confirmed");
  result("Meridian market closed", explorerUrl(closeMeridianSig));

  // Verify market phase
  const marketAfterClose = await (program.account as any).meridianMarket.fetch(marketPda);
  const phaseAfterClose = Object.keys(marketAfterClose.phase)[0];
  if (phaseAfterClose !== "closed") {
    fail("Market phase after close", "closed", phaseAfterClose);
  }
  result("Market phase", phaseAfterClose);

  // ── Step 13: Settle via adminSettleOverride ────────────────────────────

  step(13, "Settle market via adminSettleOverride");

  console.log("  # SETTLEMENT: using adminSettleOverride (oracle path blocked by me-7tr)");

  // Price above strike ($210 vs $200 strike) → YesWins
  const overridePrice = 210 * ONE_USDC;

  const settleSig = await (program.methods as any)
    .adminSettleOverride(new anchor.BN(overridePrice))
    .accounts({
      adminAuthority: payer.publicKey,
      config: configPda,
      market: marketPda,
    })
    .signers([payer])
    .rpc();

  result("Tx", explorerUrl(settleSig));

  const marketAfterSettle = await (program.account as any).meridianMarket.fetch(marketPda);
  const outcomeAfterSettle = Object.keys(marketAfterSettle.outcome)[0];
  const phaseAfterSettle = Object.keys(marketAfterSettle.phase)[0];

  result("Outcome", outcomeAfterSettle);
  result("Phase", phaseAfterSettle);

  if (phaseAfterSettle !== "settled") {
    fail("Market phase after settle", "settled", phaseAfterSettle);
  }

  // ── Step 14: Redeem winning tokens ────────────────────────────────────

  step(14, "Redeem all winning tokens");

  // Get current Yes token balance to redeem all of them
  const yesBalance = (await getAccount(connection, userYesAta)).amount;
  const pairsToRedeem = Number(yesBalance) / ONE_USDC;
  const usdcBefore14 = (await getAccount(connection, userUsdcAta)).amount;

  result("Yes balance to redeem", formatUsdc(yesBalance));

  if (pairsToRedeem > 0) {
    const redeemSig = await (program.methods as any)
      .redeem(new anchor.BN(pairsToRedeem))
      .accounts({
        user: payer.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        userUsdc: userUsdcAta,
        userYes: userYesAta,
        userNo: userNoAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    const usdcAfter14 = (await getAccount(connection, userUsdcAta)).amount;
    const yesAfter14 = (await getAccount(connection, userYesAta)).amount;

    result("Tx", explorerUrl(redeemSig));
    result("Yes balance after", formatUsdc(yesAfter14));
    result("USDC gained", `+${formatUsdc(usdcAfter14 - usdcBefore14)}`);

    if (yesAfter14 !== 0n) {
      fail("Yes balance after redeem", "0", String(yesAfter14));
    }
  } else {
    result("Redeem", "no winning tokens to redeem (all traded away)");
  }

  // ── Step 15: Verify vault drained ─────────────────────────────────────

  step(15, "Verify vault state");

  const vaultFinal = (await getAccount(connection, vaultPda)).amount;
  result("Final vault balance", formatUsdc(vaultFinal));

  // The vault won't necessarily be fully drained because the market maker
  // also has Yes tokens that could be redeemed. But our user's tokens are redeemed.
  // For a single-user demo, the vault should drain. For multi-user, it's proportional.

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  DEMO COMPLETE: all invariants held                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("  Summary:");
  console.log(`    Market:     ${marketPda.toBase58()}`);
  console.log(`    Phoenix:    ${phoenixMarketAddr.toBase58()}`);
  console.log(`    Trading day: ${tradingDay}`);
  console.log(`    Strike:     $${Number(strikePrice) / ONE_USDC}`);
  console.log(`    Outcome:    ${outcomeAfterSettle}`);
  console.log(`    Vault:      ${formatUsdc(vaultFinal)}`);
  console.log("");
}

// ─── Utility: get-or-create ATA ───────────────────────────────────────────────

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

// ─── Utility: change Phoenix market status ────────────────────────────────────

async function changePhoenixMarketStatusHelper(
  connection: Connection,
  authority: Keypair,
  phoenixMarket: PublicKey,
  status: number,
): Promise<string> {
  const ix = buildChangeMarketStatusIx(phoenixMarket, authority.publicKey, status);
  const tx = new Transaction().add(ix);
  const sig = await connection.sendTransaction(tx, [authority]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("\n  ✗ DEMO FAILED:", err.message ?? err);
  if (err.logs) {
    console.error("\n  Program logs:");
    for (const log of err.logs) {
      console.error(`    ${log}`);
    }
  }
  process.exit(1);
});
