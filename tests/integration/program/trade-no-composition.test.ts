import assert from "node:assert/strict";
import test, { describe } from "node:test";

import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import {
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

import type { Meridian } from "../../../target/types/meridian.js";
import {
  createPhoenixMarket,
  MERIDIAN_PHOENIX_DEFAULTS,
} from "../../../automation/src/clients/phoenix.js";

const PROGRAM_ID = new PublicKey(
  process.env.MERIDIAN_PROGRAM_ID ??
    "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

const CONFIG_SEED = Buffer.from("config");
const MARKET_SEED = Buffer.from("market");
const VAULT_SEED = Buffer.from("vault");
const YES_MINT_SEED = Buffer.from("yes_mint");
const NO_MINT_SEED = Buffer.from("no_mint");

const AAPL_FEED_ID = new Uint8Array([
  73, 246, 182, 92, 177, 222, 107, 16, 234, 247, 94, 124, 3, 202, 2, 156, 48,
  109, 3, 87, 233, 27, 83, 17, 177, 117, 8, 74, 90, 213, 86, 136,
]);

const ONE_USDC = 1_000_000;
const TICKER_AAPL = 0;

// Phoenix instruction discriminants
const PHOENIX_CHANGE_MARKET_STATUS = 103;
const PHOENIX_CHANGE_SEAT_STATUS = 104;
const PHOENIX_PLACE_LIMIT_ORDER = 1;
const PHOENIX_SEAT_APPROVED = 1;
const PHOENIX_POST_ONLY_TAG = 2;

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
    PROGRAM_ID,
  );
}

/** Derive Phoenix vault PDA: seeds = ["vault", market, mint] */
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
  ixData.writeUInt8(PHOENIX_CHANGE_SEAT_STATUS, 0);
  ixData.writeUInt8(PHOENIX_SEAT_APPROVED, 1);

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

/** Build a Phoenix ChangeMarketStatus instruction (discriminant 103) */
function buildChangeMarketStatusIx(
  phoenixMarket: PublicKey,
  marketAuthority: PublicKey,
  status: number,
): TransactionInstruction {
  const logAuthority = getLogAuthority();
  const ixData = Buffer.alloc(2);
  ixData.writeUInt8(PHOENIX_CHANGE_MARKET_STATUS, 0);
  ixData.writeUInt8(status, 1);

  return new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: marketAuthority, isWritable: false, isSigner: true },
    ],
    data: ixData,
  });
}

/**
 * Build a raw Phoenix PlaceLimitOrder instruction.
 * OrderPacket::PostOnly layout:
 *   tag(u8=2) + side(u8) + price_in_ticks(u64) + num_base_lots(u64) +
 *   client_order_id(u128) + reject_post_only(bool) + use_only_deposited_funds(bool) +
 *   last_valid_slot(Option<u64>) + last_valid_unix_timestamp_in_seconds(Option<u64>)
 *   + fail_silently_on_insufficient_funds(bool)
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
  packetBuf.writeUInt8(PHOENIX_POST_ONLY_TAG, offset); offset += 1;
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
  ixData.writeUInt8(PHOENIX_PLACE_LIMIT_ORDER, 0);
  packetBuf.copy(ixData, 1, 0, offset);

  return new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: trader, isWritable: false, isSigner: true },
      { pubkey: seat, isWritable: true, isSigner: false },
      { pubkey: baseVault, isWritable: true, isSigner: false },
      { pubkey: quoteVault, isWritable: true, isSigner: false },
      { pubkey: baseAccount, isWritable: true, isSigner: false },
      { pubkey: quoteAccount, isWritable: true, isSigner: false },
      {
        pubkey: anchor.utils.token.TOKEN_PROGRAM_ID,
        isWritable: false,
        isSigner: false,
      },
    ],
    data: ixData,
  });
}

describe(
  "trade_no_composition",
  { skip: !process.env.ANCHOR_PROVIDER_URL },
  () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
    const payer = (provider.wallet as anchor.Wallet).payer;

    const adminAuthority = Keypair.generate();
    const operationsAuthority = Keypair.generate();
    const trader = Keypair.generate();
    const marketMaker = Keypair.generate();

    let usdcMint: PublicKey;
    let configPda: PublicKey;
    let meridianMarketPda: PublicKey;
    let vaultPda: PublicKey;
    let yesMintPda: PublicKey;
    let noMintPda: PublicKey;

    let phoenixMarketPubkey: PublicKey;
    let phoenixBaseVault: PublicKey;
    let phoenixQuoteVault: PublicKey;

    let traderUsdcAta: PublicKey;
    let traderYesAta: PublicKey;
    let traderNoAta: PublicKey;
    let traderSeat: PublicKey;

    let mmUsdcAta: PublicKey;
    let mmYesAta: PublicKey;
    let mmNoAta: PublicKey;
    let mmSeat: PublicKey;

    // Unique trading day to avoid PDA collision with other test files
    const TRADING_DAY = 20260325;
    const STRIKE_PRICE = BigInt(200 * ONE_USDC);
    const CLOSE_TIME_TS = new anchor.BN(1_774_500_000); // far future
    const SETTLE_AFTER_TS = new anchor.BN(1_774_500_600);

    test("setup: initialize config, market, phoenix, seats, mint pairs, resting orders", async () => {
      // Airdrop
      await Promise.all([
        provider.connection.requestAirdrop(adminAuthority.publicKey, 5e9),
        provider.connection.requestAirdrop(operationsAuthority.publicKey, 5e9),
        provider.connection.requestAirdrop(trader.publicKey, 5e9),
        provider.connection.requestAirdrop(marketMaker.publicKey, 5e9),
      ]);
      await new Promise((r) => setTimeout(r, 1500));

      // Create USDC mint
      usdcMint = await createMint(
        provider.connection,
        payer,
        payer.publicKey,
        null,
        6,
      );

      // Initialize config
      [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);

      await program.methods
        .initializeConfig({
          adminAuthority: adminAuthority.publicKey,
          operationsAuthority: operationsAuthority.publicKey,
          usdcMint,
          pythReceiverProgram: Keypair.generate().publicKey,
          oracleMaximumAgeSeconds: 600,
          oracleConfidenceLimitBps: 250,
        })
        .accounts({
          payer: payer.publicKey,
          adminAuthority: adminAuthority.publicKey,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer, adminAuthority])
        .rpc();

      // Derive Meridian market PDAs
      [meridianMarketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);
      [vaultPda] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, meridianMarketPda.toBuffer()],
        PROGRAM_ID,
      );
      [yesMintPda] = PublicKey.findProgramAddressSync(
        [YES_MINT_SEED, meridianMarketPda.toBuffer()],
        PROGRAM_ID,
      );
      [noMintPda] = PublicKey.findProgramAddressSync(
        [NO_MINT_SEED, meridianMarketPda.toBuffer()],
        PROGRAM_ID,
      );

      // Create Phoenix market
      const result = await createPhoenixMarket(provider.connection, payer, {
        ...MERIDIAN_PHOENIX_DEFAULTS,
        baseMint: yesMintPda,
        quoteMint: usdcMint,
      });
      phoenixMarketPubkey = result.phoenixMarket;

      [phoenixBaseVault] = derivePhoenixVault(phoenixMarketPubkey, yesMintPda);
      [phoenixQuoteVault] = derivePhoenixVault(phoenixMarketPubkey, usdcMint);

      // Create Meridian market
      await program.methods
        .createMarket({
          ticker: { aapl: {} },
          tradingDay: TRADING_DAY,
          strikePrice: new anchor.BN(Number(STRIKE_PRICE)),
          previousClose: new anchor.BN(198 * ONE_USDC),
          closeTimeTs: CLOSE_TIME_TS,
          settleAfterTs: SETTLE_AFTER_TS,
          oracleFeedId: Array.from(AAPL_FEED_ID),
          phoenixMarket: phoenixMarketPubkey,
        })
        .accounts({
          payer: payer.publicKey,
          operationsAuthority: operationsAuthority.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          usdcMint,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer, operationsAuthority])
        .rpc();

      // Activate Phoenix market
      const activateIx = buildChangeMarketStatusIx(
        phoenixMarketPubkey,
        payer.publicKey,
        1,
      );
      const activateTx = new Transaction().add(activateIx);
      const activateSig = await provider.connection.sendTransaction(activateTx, [payer]);
      await provider.connection.confirmTransaction(activateSig, "confirmed");

      // Create token accounts for trader and market maker in parallel
      [traderUsdcAta, traderYesAta, traderNoAta, mmUsdcAta, mmYesAta, mmNoAta] =
        await Promise.all([
          createAssociatedTokenAccount(provider.connection, payer, usdcMint, trader.publicKey),
          createAssociatedTokenAccount(provider.connection, payer, yesMintPda, trader.publicKey),
          createAssociatedTokenAccount(provider.connection, payer, noMintPda, trader.publicKey),
          createAssociatedTokenAccount(provider.connection, payer, usdcMint, marketMaker.publicKey),
          createAssociatedTokenAccount(provider.connection, payer, yesMintPda, marketMaker.publicKey),
          createAssociatedTokenAccount(provider.connection, payer, noMintPda, marketMaker.publicKey),
        ]);

      // Fund trader and market maker with USDC in parallel
      await Promise.all([
        mintTo(provider.connection, payer, usdcMint, traderUsdcAta, payer.publicKey, 1000 * ONE_USDC),
        mintTo(provider.connection, payer, usdcMint, mmUsdcAta, payer.publicKey, 1000 * ONE_USDC),
      ]);

      // Mint Yes+No pairs for trader (100 pairs) and market maker (100 pairs)
      await program.methods
        .mintPair(new anchor.BN(100))
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: traderUsdcAta,
          userYes: traderYesAta,
          userNo: traderNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      await program.methods
        .mintPair(new anchor.BN(100))
        .accounts({
          user: marketMaker.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: mmUsdcAta,
          userYes: mmYesAta,
          userNo: mmNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([marketMaker])
        .rpc();

      // Request + approve seats
      const traderSeatPubkey = getSeatAddress(phoenixMarketPubkey, trader.publicKey);
      const mmSeatPubkey = getSeatAddress(phoenixMarketPubkey, marketMaker.publicKey);

      const traderRequestIx = createRequestSeatInstruction({
        phoenixProgram: PHOENIX_PROGRAM_ID,
        logAuthority: getLogAuthority(),
        market: phoenixMarketPubkey,
        payer: payer.publicKey,
        seat: traderSeatPubkey,
      });
      const mmRequestIx = createRequestSeatInstruction({
        phoenixProgram: PHOENIX_PROGRAM_ID,
        logAuthority: getLogAuthority(),
        market: phoenixMarketPubkey,
        payer: payer.publicKey,
        seat: mmSeatPubkey,
      });

      const seatTx = new Transaction().add(traderRequestIx, mmRequestIx);
      const seatSig = await provider.connection.sendTransaction(seatTx, [payer]);
      await provider.connection.confirmTransaction(seatSig, "confirmed");

      const approveTraderIx = buildApproveSeatIx(phoenixMarketPubkey, payer.publicKey, traderSeatPubkey);
      const approveMmIx = buildApproveSeatIx(phoenixMarketPubkey, payer.publicKey, mmSeatPubkey);
      const approveTx = new Transaction().add(approveTraderIx, approveMmIx);
      const approveSig = await provider.connection.sendTransaction(approveTx, [payer]);
      await provider.connection.confirmTransaction(approveSig, "confirmed");

      traderSeat = traderSeatPubkey;
      mmSeat = mmSeatPubkey;

      // Market maker places resting bid and ask at price 50
      const askIx = buildPlaceLimitOrderIx(
        phoenixMarketPubkey,
        marketMaker.publicKey,
        mmSeat,
        phoenixBaseVault,
        phoenixQuoteVault,
        mmYesAta,
        mmUsdcAta,
        "ask",
        50n,
        10n * BigInt(ONE_USDC),
      );

      const bidIx = buildPlaceLimitOrderIx(
        phoenixMarketPubkey,
        marketMaker.publicKey,
        mmSeat,
        phoenixBaseVault,
        phoenixQuoteVault,
        mmYesAta,
        mmUsdcAta,
        "bid",
        50n,
        10n * BigInt(ONE_USDC),
      );

      const orderTx = new Transaction().add(askIx, bidIx);
      const orderSig = await provider.connection.sendTransaction(orderTx, [marketMaker]);
      await provider.connection.confirmTransaction(orderSig, "confirmed");
    });

    // ── Buy No: mintPair then sell Yes on Phoenix ──────────────────────
    // Net effect: user spends USDC (via mint), sells freshly minted Yes tokens,
    // keeps the No tokens. Yes balance nets to zero (minted then sold).

    test("Buy No: mint pair then sell Yes on Phoenix", async () => {
      const usdcBefore = await getAccount(provider.connection, traderUsdcAta);
      const yesBefore = await getAccount(provider.connection, traderYesAta);
      const noBefore = await getAccount(provider.connection, traderNoAta);

      // Step 1: mintPair(5) — costs 5 USDC, receive 5 Yes + 5 No
      await program.methods
        .mintPair(new anchor.BN(5))
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: traderUsdcAta,
          userYes: traderYesAta,
          userNo: traderNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      // Step 2: tradeYes(Sell) — sell Yes tokens on Phoenix for USDC
      await program.methods
        .tradeYes({
          side: { sell: {} },
          numBaseLots: new anchor.BN(5 * ONE_USDC),
          priceInTicks: new anchor.BN(50),
          lastValidUnixTimestampInSeconds: null,
        })
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          yesMint: yesMintPda,
          phoenixMarket: phoenixMarketPubkey,
          userYes: traderYesAta,
          userUsdc: traderUsdcAta,
          phoenixBaseVault,
          phoenixQuoteVault,
          seat: traderSeat,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, traderUsdcAta);
      const yesAfter = await getAccount(provider.connection, traderYesAta);
      const noAfter = await getAccount(provider.connection, traderNoAta);

      // No balance increased (user kept the No tokens from minting)
      assert.ok(
        noAfter.amount > noBefore.amount,
        "No balance should increase after Buy No composition",
      );

      // USDC decreased (mint cost minus sell proceeds)
      assert.ok(
        usdcAfter.amount < usdcBefore.amount,
        "USDC should decrease (mint cost > sell proceeds at sub-$1 price)",
      );
    });

    // ── Sell No: buy Yes on Phoenix then merge pair ───────────────────
    // Net effect: user buys Yes on Phoenix, then merges Yes+No to get USDC back.
    // No balance decreases. Yes balance nets to zero (bought then burned).

    test("Sell No: buy Yes on Phoenix then merge pair", async () => {
      const usdcBefore = await getAccount(provider.connection, traderUsdcAta);
      const yesBefore = await getAccount(provider.connection, traderYesAta);
      const noBefore = await getAccount(provider.connection, traderNoAta);

      // Step 1: tradeYes(Buy) — buy 2 USDC worth of Yes tokens
      await program.methods
        .tradeYes({
          side: { buy: {} },
          numBaseLots: new anchor.BN(2 * ONE_USDC),
          priceInTicks: new anchor.BN(50),
          lastValidUnixTimestampInSeconds: null,
        })
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          yesMint: yesMintPda,
          phoenixMarket: phoenixMarketPubkey,
          userYes: traderYesAta,
          userUsdc: traderUsdcAta,
          phoenixBaseVault,
          phoenixQuoteVault,
          seat: traderSeat,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      // Step 2: mergePair(2) — burn 2 Yes + 2 No, get 2 USDC from vault
      await program.methods
        .mergePair(new anchor.BN(2))
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: traderUsdcAta,
          userYes: traderYesAta,
          userNo: traderNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, traderUsdcAta);
      const yesAfter = await getAccount(provider.connection, traderYesAta);
      const noAfter = await getAccount(provider.connection, traderNoAta);

      // No balance decreased (burned in merge)
      assert.ok(
        noAfter.amount < noBefore.amount,
        "No balance should decrease after Sell No composition",
      );

      // USDC changed (merge returns 1 USDC per pair, minus buy cost)
      // At price 50 ticks (sub-$1), buying Yes costs less than the merge return of $1
      // so net USDC should increase
      assert.ok(
        usdcAfter.amount > usdcBefore.amount,
        "USDC should increase (merge return $1 > buy cost at sub-$1 price)",
      );
    });

    // ── Buy No: exact balance accounting ──────────────────────────────

    test("Buy No: exact balance accounting", async () => {
      const usdcBefore = await getAccount(provider.connection, traderUsdcAta);
      const yesBefore = await getAccount(provider.connection, traderYesAta);
      const noBefore = await getAccount(provider.connection, traderNoAta);
      const vaultBefore = await getAccount(provider.connection, vaultPda);

      // mintPair(1)
      await program.methods
        .mintPair(new anchor.BN(1))
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: traderUsdcAta,
          userYes: traderYesAta,
          userNo: traderNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      // tradeYes(Sell, 1 USDC worth)
      await program.methods
        .tradeYes({
          side: { sell: {} },
          numBaseLots: new anchor.BN(1 * ONE_USDC),
          priceInTicks: new anchor.BN(50),
          lastValidUnixTimestampInSeconds: null,
        })
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          yesMint: yesMintPda,
          phoenixMarket: phoenixMarketPubkey,
          userYes: traderYesAta,
          userUsdc: traderUsdcAta,
          phoenixBaseVault,
          phoenixQuoteVault,
          seat: traderSeat,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, traderUsdcAta);
      const yesAfter = await getAccount(provider.connection, traderYesAta);
      const noAfter = await getAccount(provider.connection, traderNoAta);
      const vaultAfter = await getAccount(provider.connection, vaultPda);

      // Vault increased by exactly 1 USDC (from mintPair)
      assert.equal(
        vaultAfter.amount - vaultBefore.amount,
        BigInt(1 * ONE_USDC),
        "Vault should increase by exactly 1 USDC from mint",
      );

      // Trader No increased by exactly 1 USDC (from mintPair)
      assert.equal(
        noAfter.amount - noBefore.amount,
        BigInt(1 * ONE_USDC),
        "Trader No should increase by 1 USDC worth",
      );

      // Trader Yes net zero: minted 1 USDC worth, sold 1 USDC worth
      assert.equal(
        yesAfter.amount,
        yesBefore.amount,
        "Trader Yes should net zero (minted then sold)",
      );
    });

    // ── Sell No: exact balance accounting ─────────────────────────────

    test("Sell No: exact balance accounting", async () => {
      const usdcBefore = await getAccount(provider.connection, traderUsdcAta);
      const yesBefore = await getAccount(provider.connection, traderYesAta);
      const noBefore = await getAccount(provider.connection, traderNoAta);
      const vaultBefore = await getAccount(provider.connection, vaultPda);

      // tradeYes(Buy, 1 USDC worth)
      await program.methods
        .tradeYes({
          side: { buy: {} },
          numBaseLots: new anchor.BN(1 * ONE_USDC),
          priceInTicks: new anchor.BN(50),
          lastValidUnixTimestampInSeconds: null,
        })
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          yesMint: yesMintPda,
          phoenixMarket: phoenixMarketPubkey,
          userYes: traderYesAta,
          userUsdc: traderUsdcAta,
          phoenixBaseVault,
          phoenixQuoteVault,
          seat: traderSeat,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      // mergePair(1)
      await program.methods
        .mergePair(new anchor.BN(1))
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: traderUsdcAta,
          userYes: traderYesAta,
          userNo: traderNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, traderUsdcAta);
      const yesAfter = await getAccount(provider.connection, traderYesAta);
      const noAfter = await getAccount(provider.connection, traderNoAta);
      const vaultAfter = await getAccount(provider.connection, vaultPda);

      // Vault decreased by exactly 1 USDC (from merge)
      assert.equal(
        vaultBefore.amount - vaultAfter.amount,
        BigInt(1 * ONE_USDC),
        "Vault should decrease by exactly 1 USDC from merge",
      );

      // Trader No decreased by exactly 1 USDC (burned in merge)
      assert.equal(
        noBefore.amount - noAfter.amount,
        BigInt(1 * ONE_USDC),
        "Trader No should decrease by 1 USDC worth",
      );

      // Trader Yes net zero: bought 1 USDC worth, burned 1 USDC worth
      assert.equal(
        yesAfter.amount,
        yesBefore.amount,
        "Trader Yes should net zero (bought then burned)",
      );
    });

    // ── Vault collateral consistency ──────────────────────────────────

    test("vault collateral consistency after composed flows", async () => {
      const market = await program.account.meridianMarket.fetch(meridianMarketPda);
      const vaultAccount = await getAccount(provider.connection, vaultPda);

      const deposited = BigInt(market.totalCollateralDeposited.toNumber());
      const returned = BigInt(market.totalCollateralReturned.toNumber());
      const expectedVault = (deposited - returned) * BigInt(ONE_USDC);

      assert.equal(
        vaultAccount.amount,
        expectedVault,
        `Vault balance (${vaultAccount.amount}) should equal (deposited ${deposited} - returned ${returned}) * ONE_USDC`,
      );
    });

    // ── Sell No fails with insufficient No tokens ─────────────────────

    test("Sell No fails with insufficient No tokens", async () => {
      // Fresh user with USDC only — no No tokens
      const freshUser = Keypair.generate();
      await provider.connection.requestAirdrop(freshUser.publicKey, 2e9);
      await new Promise((r) => setTimeout(r, 1000));

      const [freshUsdcAta, freshYesAta, freshNoAta] = await Promise.all([
        createAssociatedTokenAccount(provider.connection, payer, usdcMint, freshUser.publicKey),
        createAssociatedTokenAccount(provider.connection, payer, yesMintPda, freshUser.publicKey),
        createAssociatedTokenAccount(provider.connection, payer, noMintPda, freshUser.publicKey),
      ]);

      await mintTo(
        provider.connection, payer, usdcMint, freshUsdcAta,
        payer.publicKey, 100 * ONE_USDC,
      );

      // Request + approve seat for fresh user
      const freshSeatPubkey = getSeatAddress(phoenixMarketPubkey, freshUser.publicKey);
      const requestIx = createRequestSeatInstruction({
        phoenixProgram: PHOENIX_PROGRAM_ID,
        logAuthority: getLogAuthority(),
        market: phoenixMarketPubkey,
        payer: payer.publicKey,
        seat: freshSeatPubkey,
      });
      const approveIx = buildApproveSeatIx(phoenixMarketPubkey, payer.publicKey, freshSeatPubkey);
      const seatTx = new Transaction().add(requestIx, approveIx);
      const seatSig = await provider.connection.sendTransaction(seatTx, [payer]);
      await provider.connection.confirmTransaction(seatSig, "confirmed");

      // Step 1: tradeYes(Buy) succeeds — buy Yes tokens from resting ask
      await program.methods
        .tradeYes({
          side: { buy: {} },
          numBaseLots: new anchor.BN(1 * ONE_USDC),
          priceInTicks: new anchor.BN(50),
          lastValidUnixTimestampInSeconds: null,
        })
        .accounts({
          user: freshUser.publicKey,
          config: configPda,
          market: meridianMarketPda,
          yesMint: yesMintPda,
          phoenixMarket: phoenixMarketPubkey,
          userYes: freshYesAta,
          userUsdc: freshUsdcAta,
          phoenixBaseVault,
          phoenixQuoteVault,
          seat: freshSeatPubkey,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([freshUser])
        .rpc();

      // Step 2: mergePair should fail — user has Yes but no No tokens
      await assert.rejects(
        program.methods
          .mergePair(new anchor.BN(1))
          .accounts({
            user: freshUser.publicKey,
            config: configPda,
            market: meridianMarketPda,
            vault: vaultPda,
            yesMint: yesMintPda,
            noMint: noMintPda,
            userUsdc: freshUsdcAta,
            userYes: freshYesAta,
            userNo: freshNoAta,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([freshUser])
          .rpc(),
        /insufficient/i,
        "Merge should fail when user has no No tokens",
      );
    });

    // ── Buy No partial fill: IOC with excess size ─────────────────────

    test("Buy No partial fill: Phoenix IOC with excess size", async () => {
      const yesBefore = await getAccount(provider.connection, traderYesAta);
      const noBefore = await getAccount(provider.connection, traderNoAta);

      // Mint a large amount of pairs
      await program.methods
        .mintPair(new anchor.BN(50))
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: traderUsdcAta,
          userYes: traderYesAta,
          userNo: traderNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      // Try to sell more Yes than there's liquidity for (IOC doesn't revert)
      await program.methods
        .tradeYes({
          side: { sell: {} },
          numBaseLots: new anchor.BN(50 * ONE_USDC),
          priceInTicks: new anchor.BN(50),
          lastValidUnixTimestampInSeconds: null,
        })
        .accounts({
          user: trader.publicKey,
          config: configPda,
          market: meridianMarketPda,
          yesMint: yesMintPda,
          phoenixMarket: phoenixMarketPubkey,
          userYes: traderYesAta,
          userUsdc: traderUsdcAta,
          phoenixBaseVault,
          phoenixQuoteVault,
          seat: traderSeat,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      const yesAfter = await getAccount(provider.connection, traderYesAta);
      const noAfter = await getAccount(provider.connection, traderNoAta);

      // No balance increased by full 50 (from mint)
      assert.equal(
        noAfter.amount - noBefore.amount,
        BigInt(50 * ONE_USDC),
        "No balance should increase by full mint amount",
      );

      // Yes balance: minted 50, sold some (partial fill), so trader retains unfilled Yes
      // The IOC fills what it can against resting bids and cancels the rest
      assert.ok(
        yesAfter.amount > yesBefore.amount,
        "Trader should retain unfilled Yes tokens from partial IOC fill",
      );
    });
  },
);
