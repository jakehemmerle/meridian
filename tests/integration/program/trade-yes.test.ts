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
  marketHeaderBeet,
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
  ixData.writeUInt8(104, 0); // ChangeSeatStatus discriminant
  ixData.writeUInt8(1, 1); // SeatApprovalStatus::Approved

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

/** Build a Phoenix ChangeMarketStatus instruction (discriminant 103, status=1 for Active) */
function buildChangeMarketStatusIx(
  phoenixMarket: PublicKey,
  marketAuthority: PublicKey,
  status: number,
): TransactionInstruction {
  const logAuthority = getLogAuthority();
  const ixData = Buffer.alloc(2);
  ixData.writeUInt8(103, 0); // ChangeMarketStatus discriminant
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
 * Build a raw Phoenix PlaceLimitOrder instruction to place a resting order.
 * Discriminant = 2 (PlaceMultiplePostOnlyOrders is complex; use PlaceLimitOrder).
 *
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

  // Build OrderPacket::PostOnly
  const packetBuf = Buffer.alloc(128);
  let offset = 0;
  packetBuf.writeUInt8(2, offset); offset += 1; // PostOnly tag
  packetBuf.writeUInt8(side === "bid" ? 0 : 1, offset); offset += 1; // Side: Bid=0, Ask=1
  packetBuf.writeBigUInt64LE(priceInTicks, offset); offset += 8; // price_in_ticks
  packetBuf.writeBigUInt64LE(numBaseLots, offset); offset += 8; // num_base_lots
  // client_order_id (u128) = 0
  packetBuf.writeBigUInt64LE(0n, offset); offset += 8;
  packetBuf.writeBigUInt64LE(0n, offset); offset += 8;
  packetBuf.writeUInt8(0, offset); offset += 1; // reject_post_only = false
  packetBuf.writeUInt8(0, offset); offset += 1; // use_only_deposited_funds = false
  // last_valid_slot: None
  packetBuf.writeUInt8(0, offset); offset += 1;
  // last_valid_unix_timestamp_in_seconds: None
  packetBuf.writeUInt8(0, offset); offset += 1;
  // fail_silently_on_insufficient_funds = true
  packetBuf.writeUInt8(1, offset); offset += 1;

  // Instruction: discriminant(u8=0 = Swap) — but for limit order we use 1 = PlaceLimitOrder
  const ixData = Buffer.alloc(1 + offset);
  ixData.writeUInt8(1, 0); // PlaceLimitOrder discriminant
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
  "trade_yes",
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

    // Far-future close time so market is in Trading phase
    const TRADING_DAY = 20260320;
    const STRIKE_PRICE = BigInt(200 * ONE_USDC);
    const CLOSE_TIME_TS = new anchor.BN(1_774_000_000); // ~2026-03-20 far future
    const SETTLE_AFTER_TS = new anchor.BN(1_774_000_600);

    test("setup: initialize config, market, phoenix market, seats, and mint pairs", async () => {
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

      // Create Phoenix market first to get the address
      const result = await createPhoenixMarket(provider.connection, payer, {
        ...MERIDIAN_PHOENIX_DEFAULTS,
        baseMint: yesMintPda,
        quoteMint: usdcMint,
      });
      phoenixMarketPubkey = result.phoenixMarket;

      [phoenixBaseVault] = derivePhoenixVault(phoenixMarketPubkey, yesMintPda);
      [phoenixQuoteVault] = derivePhoenixVault(phoenixMarketPubkey, usdcMint);

      // Create Meridian market with the real phoenix market address
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

      // Set Phoenix market to Active (from PostOnly)
      const activateIx = buildChangeMarketStatusIx(
        phoenixMarketPubkey,
        payer.publicKey,
        1, // Active
      );
      const activateTx = new Transaction().add(activateIx);
      const activateSig = await provider.connection.sendTransaction(activateTx, [payer]);
      await provider.connection.confirmTransaction(activateSig, "confirmed");

      // Create token accounts for trader
      traderUsdcAta = await createAssociatedTokenAccount(
        provider.connection, payer, usdcMint, trader.publicKey,
      );
      traderYesAta = await createAssociatedTokenAccount(
        provider.connection, payer, yesMintPda, trader.publicKey,
      );
      traderNoAta = await createAssociatedTokenAccount(
        provider.connection, payer, noMintPda, trader.publicKey,
      );

      // Create token accounts for market maker
      mmUsdcAta = await createAssociatedTokenAccount(
        provider.connection, payer, usdcMint, marketMaker.publicKey,
      );
      mmYesAta = await createAssociatedTokenAccount(
        provider.connection, payer, yesMintPda, marketMaker.publicKey,
      );
      mmNoAta = await createAssociatedTokenAccount(
        provider.connection, payer, noMintPda, marketMaker.publicKey,
      );

      // Fund trader with USDC (1000 USDC)
      await mintTo(
        provider.connection, payer, usdcMint, traderUsdcAta,
        payer.publicKey, 1000 * ONE_USDC,
      );

      // Fund market maker with USDC (1000 USDC)
      await mintTo(
        provider.connection, payer, usdcMint, mmUsdcAta,
        payer.publicKey, 1000 * ONE_USDC,
      );

      // Mint Yes+No pairs for both trader (for sell tests) and market maker (for resting orders)
      // Trader: mint 100 pairs
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

      // Market maker: mint 100 pairs
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

      // Request + approve seats for trader and market maker
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

      // Approve both seats
      const approveTraderIx = buildApproveSeatIx(phoenixMarketPubkey, payer.publicKey, traderSeatPubkey);
      const approveMmIx = buildApproveSeatIx(phoenixMarketPubkey, payer.publicKey, mmSeatPubkey);
      const approveTx = new Transaction().add(approveTraderIx, approveMmIx);
      const approveSig = await provider.connection.sendTransaction(approveTx, [payer]);
      await provider.connection.confirmTransaction(approveSig, "confirmed");

      traderSeat = traderSeatPubkey;
      mmSeat = mmSeatPubkey;

      // Market maker places resting ask at price 50 (sell Yes tokens for USDC)
      // and resting bid at price 50 (buy Yes tokens with USDC)
      const askIx = buildPlaceLimitOrderIx(
        phoenixMarketPubkey,
        marketMaker.publicKey,
        mmSeat,
        phoenixBaseVault,
        phoenixQuoteVault,
        mmYesAta,
        mmUsdcAta,
        "ask",
        50n, // price in ticks
        10n * BigInt(ONE_USDC), // num base lots
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

    test("buy Yes happy path: IOC bid fills resting ask", async () => {
      const usdcBefore = await getAccount(provider.connection, traderUsdcAta);
      const yesBefore = await getAccount(provider.connection, traderYesAta);

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
          phoenixBaseVault: phoenixBaseVault,
          phoenixQuoteVault: phoenixQuoteVault,
          seat: traderSeat,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, traderUsdcAta);
      const yesAfter = await getAccount(provider.connection, traderYesAta);

      // User should have more Yes tokens
      assert.ok(
        yesAfter.amount > yesBefore.amount,
        "Yes balance should increase after buy",
      );
      // User should have less USDC
      assert.ok(
        usdcAfter.amount < usdcBefore.amount,
        "USDC balance should decrease after buy",
      );
    });

    test("sell Yes happy path: IOC ask fills resting bid", async () => {
      const usdcBefore = await getAccount(provider.connection, traderUsdcAta);
      const yesBefore = await getAccount(provider.connection, traderYesAta);

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
          phoenixBaseVault: phoenixBaseVault,
          phoenixQuoteVault: phoenixQuoteVault,
          seat: traderSeat,
          logAuthority: getLogAuthority(),
          phoenixProgram: PHOENIX_PROGRAM_ID,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, traderUsdcAta);
      const yesAfter = await getAccount(provider.connection, traderYesAta);

      // User should have less Yes tokens
      assert.ok(
        yesAfter.amount < yesBefore.amount,
        "Yes balance should decrease after sell",
      );
      // User should have more USDC
      assert.ok(
        usdcAfter.amount > usdcBefore.amount,
        "USDC balance should increase after sell",
      );
    });

    test("reject: protocol paused", async () => {
      // Pause
      await program.methods
        .pauseProtocol()
        .accounts({
          adminAuthority: adminAuthority.publicKey,
          config: configPda,
        })
        .signers([adminAuthority])
        .rpc();

      await assert.rejects(
        program.methods
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
            phoenixBaseVault: phoenixBaseVault,
            phoenixQuoteVault: phoenixQuoteVault,
            seat: traderSeat,
            logAuthority: getLogAuthority(),
            phoenixProgram: PHOENIX_PROGRAM_ID,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([trader])
          .rpc(),
        /ProtocolPaused/,
      );

      // Unpause for subsequent tests
      await program.methods
        .unpauseProtocol()
        .accounts({
          adminAuthority: adminAuthority.publicKey,
          config: configPda,
        })
        .signers([adminAuthority])
        .rpc();
    });

    test("reject: wrong Phoenix market", async () => {
      const wrongPhoenixMarket = Keypair.generate().publicKey;

      await assert.rejects(
        program.methods
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
            phoenixMarket: wrongPhoenixMarket,
            userYes: traderYesAta,
            userUsdc: traderUsdcAta,
            phoenixBaseVault: phoenixBaseVault,
            phoenixQuoteVault: phoenixQuoteVault,
            seat: traderSeat,
            logAuthority: getLogAuthority(),
            phoenixProgram: PHOENIX_PROGRAM_ID,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([trader])
          .rpc(),
        /PhoenixMarketMismatch/,
      );
    });

    test("reject: order expiry exceeds market close", async () => {
      // Use an expiry timestamp way beyond close_time_ts
      const expiryBeyondClose = CLOSE_TIME_TS.toNumber() + 86400;

      await assert.rejects(
        program.methods
          .tradeYes({
            side: { buy: {} },
            numBaseLots: new anchor.BN(1 * ONE_USDC),
            priceInTicks: new anchor.BN(50),
            lastValidUnixTimestampInSeconds: new anchor.BN(expiryBeyondClose),
          })
          .accounts({
            user: trader.publicKey,
            config: configPda,
            market: meridianMarketPda,
            yesMint: yesMintPda,
            phoenixMarket: phoenixMarketPubkey,
            userYes: traderYesAta,
            userUsdc: traderUsdcAta,
            phoenixBaseVault: phoenixBaseVault,
            phoenixQuoteVault: phoenixQuoteVault,
            seat: traderSeat,
            logAuthority: getLogAuthority(),
            phoenixProgram: PHOENIX_PROGRAM_ID,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([trader])
          .rpc(),
        /OrderExpiryExceedsMarketClose/,
      );
    });
  },
);
