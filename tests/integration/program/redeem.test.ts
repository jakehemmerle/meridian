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
} from "@solana/web3.js";

import type { Meridian } from "../../../target/types/meridian.js";

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

describe(
  "redeem",
  { skip: !process.env.ANCHOR_PROVIDER_URL },
  () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
    const payer = (provider.wallet as anchor.Wallet).payer;

    const adminAuthority = Keypair.generate();
    const operationsAuthority = Keypair.generate();
    const redeemer = Keypair.generate();

    let usdcMint: PublicKey;
    let configPda: PublicKey;
    let marketPda: PublicKey;
    let vaultPda: PublicKey;
    let yesMintPda: PublicKey;
    let noMintPda: PublicKey;

    let redeemerUsdcAta: PublicKey;
    let redeemerYesAta: PublicKey;
    let redeemerNoAta: PublicKey;

    // Use a past close time so the market is in Closed phase for settlement
    const TRADING_DAY = 20260310;
    const STRIKE_PRICE = BigInt(200 * ONE_USDC);
    // Past timestamps so market is already closed
    const CLOSE_TIME_TS = new anchor.BN(1_700_000_000);
    const SETTLE_AFTER_TS = new anchor.BN(1_700_000_001);
    // Override price above strike -> Yes wins
    const OVERRIDE_PRICE_YES = 210 * ONE_USDC;

    test("setup: initialize config, market, mint pairs", async () => {
      // Airdrop
      await Promise.all([
        provider.connection.requestAirdrop(adminAuthority.publicKey, 5e9),
        provider.connection.requestAirdrop(operationsAuthority.publicKey, 5e9),
        provider.connection.requestAirdrop(redeemer.publicKey, 5e9),
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

      // Derive market PDAs
      [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);
      [vaultPda] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, marketPda.toBuffer()],
        PROGRAM_ID,
      );
      [yesMintPda] = PublicKey.findProgramAddressSync(
        [YES_MINT_SEED, marketPda.toBuffer()],
        PROGRAM_ID,
      );
      [noMintPda] = PublicKey.findProgramAddressSync(
        [NO_MINT_SEED, marketPda.toBuffer()],
        PROGRAM_ID,
      );

      // Create market (past close time so it's already Closed)
      await program.methods
        .createMarket({
          ticker: { aapl: {} },
          tradingDay: TRADING_DAY,
          strikePrice: new anchor.BN(Number(STRIKE_PRICE)),
          previousClose: new anchor.BN(198 * ONE_USDC),
          closeTimeTs: CLOSE_TIME_TS,
          settleAfterTs: SETTLE_AFTER_TS,
          oracleFeedId: Array.from(AAPL_FEED_ID),
          phoenixMarket: Keypair.generate().publicKey, // not needed for redeem
        })
        .accounts({
          payer: payer.publicKey,
          operationsAuthority: operationsAuthority.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          usdcMint,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer, operationsAuthority])
        .rpc();

      // Create token accounts for redeemer
      redeemerUsdcAta = await createAssociatedTokenAccount(
        provider.connection, payer, usdcMint, redeemer.publicKey,
      );
      redeemerYesAta = await createAssociatedTokenAccount(
        provider.connection, payer, yesMintPda, redeemer.publicKey,
      );
      redeemerNoAta = await createAssociatedTokenAccount(
        provider.connection, payer, noMintPda, redeemer.publicKey,
      );

      // Fund redeemer with USDC and mint pairs
      await mintTo(
        provider.connection, payer, usdcMint, redeemerUsdcAta,
        payer.publicKey, 100 * ONE_USDC,
      );

      await program.methods
        .mintPair(new anchor.BN(50))
        .accounts({
          user: redeemer.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: redeemerUsdcAta,
          userYes: redeemerYesAta,
          userNo: redeemerNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([redeemer])
        .rpc();

      // Settle market via admin override (price above strike -> Yes wins)
      await program.methods
        .adminSettleOverride(new anchor.BN(OVERRIDE_PRICE_YES))
        .accounts({
          adminAuthority: adminAuthority.publicKey,
          config: configPda,
          market: marketPda,
        })
        .signers([adminAuthority])
        .rpc();
    });

    test("redeem happy path: Yes winner redeems for USDC", async () => {
      const usdcBefore = await getAccount(provider.connection, redeemerUsdcAta);
      const yesBefore = await getAccount(provider.connection, redeemerYesAta);

      await program.methods
        .redeem(new anchor.BN(10))
        .accounts({
          user: redeemer.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: redeemerUsdcAta,
          userYes: redeemerYesAta,
          userNo: redeemerNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([redeemer])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, redeemerUsdcAta);
      const yesAfter = await getAccount(provider.connection, redeemerYesAta);

      // User should have 10 more USDC (10 * ONE_USDC)
      assert.equal(
        usdcAfter.amount - usdcBefore.amount,
        BigInt(10 * ONE_USDC),
        "USDC balance should increase by 10 USDC",
      );
      // User should have 10 fewer Yes tokens
      assert.equal(
        yesBefore.amount - yesAfter.amount,
        BigInt(10 * ONE_USDC),
        "Yes balance should decrease by 10 tokens",
      );
    });

    test("redeem remaining pairs", async () => {
      const yesBefore = await getAccount(provider.connection, redeemerYesAta);

      await program.methods
        .redeem(new anchor.BN(40))
        .accounts({
          user: redeemer.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: redeemerUsdcAta,
          userYes: redeemerYesAta,
          userNo: redeemerNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([redeemer])
        .rpc();

      const yesAfter = await getAccount(provider.connection, redeemerYesAta);
      assert.equal(
        yesAfter.amount,
        yesBefore.amount - BigInt(40 * ONE_USDC),
        "All remaining Yes tokens should be burned",
      );
    });

    test("reject: redeem zero pairs", async () => {
      await assert.rejects(
        program.methods
          .redeem(new anchor.BN(0))
          .accounts({
            user: redeemer.publicKey,
            config: configPda,
            market: marketPda,
            vault: vaultPda,
            yesMint: yesMintPda,
            noMint: noMintPda,
            userUsdc: redeemerUsdcAta,
            userYes: redeemerYesAta,
            userNo: redeemerNoAta,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([redeemer])
          .rpc(),
        /InvalidPairAmount/,
      );
    });

    test("reject: redeem exceeds winning OI", async () => {
      await assert.rejects(
        program.methods
          .redeem(new anchor.BN(1))
          .accounts({
            user: redeemer.publicKey,
            config: configPda,
            market: marketPda,
            vault: vaultPda,
            yesMint: yesMintPda,
            noMint: noMintPda,
            userUsdc: redeemerUsdcAta,
            userYes: redeemerYesAta,
            userNo: redeemerNoAta,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([redeemer])
          .rpc(),
        /InsufficientWinningOpenInterest/,
      );
    });
  },
);
