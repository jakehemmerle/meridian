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
  "redeem_multiuser",
  { skip: !process.env.ANCHOR_PROVIDER_URL },
  () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
    const payer = (provider.wallet as anchor.Wallet).payer;

    const adminAuthority = Keypair.generate();
    const operationsAuthority = Keypair.generate();
    const alice = Keypair.generate();
    const bob = Keypair.generate();

    let usdcMint: PublicKey;
    let configPda: PublicKey;
    let marketPda: PublicKey;
    let vaultPda: PublicKey;
    let yesMintPda: PublicKey;
    let noMintPda: PublicKey;

    let aliceUsdcAta: PublicKey;
    let aliceYesAta: PublicKey;
    let aliceNoAta: PublicKey;

    let bobUsdcAta: PublicKey;
    let bobYesAta: PublicKey;
    let bobNoAta: PublicKey;

    // Past close time so admin_settle_override can auto-close + settle
    const TRADING_DAY = 20260311;
    const STRIKE_PRICE = BigInt(200 * ONE_USDC);
    const CLOSE_TIME_TS = new anchor.BN(1_700_000_000);
    const SETTLE_AFTER_TS = new anchor.BN(1_700_000_001);
    const OVERRIDE_PRICE_YES = 210 * ONE_USDC; // Above strike → Yes wins

    // Alice mints 30 pairs, Bob mints 70 pairs. After Yes settlement,
    // both redeem all Yes holdings and vault drains to zero.
    const ALICE_MINT_PAIRS = 30;
    const BOB_MINT_PAIRS = 70;
    const TOTAL_PAIRS = ALICE_MINT_PAIRS + BOB_MINT_PAIRS;

    test("setup: initialize config, market, fund users, mint pairs, settle", async () => {
      // Airdrop SOL
      await Promise.all([
        provider.connection.requestAirdrop(adminAuthority.publicKey, 5e9),
        provider.connection.requestAirdrop(operationsAuthority.publicKey, 5e9),
        provider.connection.requestAirdrop(alice.publicKey, 5e9),
        provider.connection.requestAirdrop(bob.publicKey, 5e9),
      ]);
      await new Promise((r) => setTimeout(r, 1500));

      // Create USDC mint
      usdcMint = await createMint(
        provider.connection, payer, payer.publicKey, null, 6,
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
      [marketPda] = deriveMarketPda(0, TRADING_DAY, STRIKE_PRICE);
      [vaultPda] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, marketPda.toBuffer()], PROGRAM_ID,
      );
      [yesMintPda] = PublicKey.findProgramAddressSync(
        [YES_MINT_SEED, marketPda.toBuffer()], PROGRAM_ID,
      );
      [noMintPda] = PublicKey.findProgramAddressSync(
        [NO_MINT_SEED, marketPda.toBuffer()], PROGRAM_ID,
      );

      // Create market (past close time — starts in Trading phase)
      await program.methods
        .createMarket({
          ticker: { aapl: {} },
          tradingDay: TRADING_DAY,
          strikePrice: new anchor.BN(Number(STRIKE_PRICE)),
          previousClose: new anchor.BN(198 * ONE_USDC),
          closeTimeTs: CLOSE_TIME_TS,
          settleAfterTs: SETTLE_AFTER_TS,
          oracleFeedId: Array.from(AAPL_FEED_ID),
          phoenixMarket: Keypair.generate().publicKey,
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

      // Create token accounts for Alice
      aliceUsdcAta = await createAssociatedTokenAccount(
        provider.connection, payer, usdcMint, alice.publicKey,
      );
      aliceYesAta = await createAssociatedTokenAccount(
        provider.connection, payer, yesMintPda, alice.publicKey,
      );
      aliceNoAta = await createAssociatedTokenAccount(
        provider.connection, payer, noMintPda, alice.publicKey,
      );

      // Create token accounts for Bob
      bobUsdcAta = await createAssociatedTokenAccount(
        provider.connection, payer, usdcMint, bob.publicKey,
      );
      bobYesAta = await createAssociatedTokenAccount(
        provider.connection, payer, yesMintPda, bob.publicKey,
      );
      bobNoAta = await createAssociatedTokenAccount(
        provider.connection, payer, noMintPda, bob.publicKey,
      );

      // Fund both with USDC
      await mintTo(
        provider.connection, payer, usdcMint, aliceUsdcAta,
        payer.publicKey, 500 * ONE_USDC,
      );
      await mintTo(
        provider.connection, payer, usdcMint, bobUsdcAta,
        payer.publicKey, 500 * ONE_USDC,
      );

      // Alice mints 30 pairs
      await program.methods
        .mintPair(new anchor.BN(ALICE_MINT_PAIRS))
        .accounts({
          user: alice.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: aliceUsdcAta,
          userYes: aliceYesAta,
          userNo: aliceNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      // Bob mints 70 pairs
      await program.methods
        .mintPair(new anchor.BN(BOB_MINT_PAIRS))
        .accounts({
          user: bob.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: bobUsdcAta,
          userYes: bobYesAta,
          userNo: bobNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([bob])
        .rpc();

      // Verify vault holds total collateral
      const vault = await getAccount(provider.connection, vaultPda);
      assert.equal(
        vault.amount,
        BigInt(TOTAL_PAIRS * ONE_USDC),
        `Vault should hold ${TOTAL_PAIRS} USDC after minting`,
      );

      // Settle market via admin override (Yes wins)
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

    test("Alice redeems all 30 winning Yes tokens", async () => {
      const usdcBefore = await getAccount(provider.connection, aliceUsdcAta);

      await program.methods
        .redeem(new anchor.BN(ALICE_MINT_PAIRS))
        .accounts({
          user: alice.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: aliceUsdcAta,
          userYes: aliceYesAta,
          userNo: aliceNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, aliceUsdcAta);
      const yesAfter = await getAccount(provider.connection, aliceYesAta);

      assert.equal(
        yesAfter.amount,
        0n,
        "Alice should have 0 Yes tokens after full redemption",
      );
      assert.equal(
        usdcAfter.amount - usdcBefore.amount,
        BigInt(ALICE_MINT_PAIRS * ONE_USDC),
        `Alice should receive exactly ${ALICE_MINT_PAIRS} USDC`,
      );
    });

    test("Bob partially redeems 40 of 70 winning Yes tokens", async () => {
      const usdcBefore = await getAccount(provider.connection, bobUsdcAta);
      const yesBefore = await getAccount(provider.connection, bobYesAta);

      await program.methods
        .redeem(new anchor.BN(40))
        .accounts({
          user: bob.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: bobUsdcAta,
          userYes: bobYesAta,
          userNo: bobNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([bob])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, bobUsdcAta);
      const yesAfter = await getAccount(provider.connection, bobYesAta);

      assert.equal(
        usdcAfter.amount - usdcBefore.amount,
        BigInt(40 * ONE_USDC),
        "Bob should receive exactly 40 USDC for partial redemption",
      );
      assert.equal(
        yesBefore.amount - yesAfter.amount,
        BigInt(40 * ONE_USDC),
        "Bob should burn exactly 40 Yes tokens",
      );
    });

    test("Bob redeems remaining 30 Yes tokens", async () => {
      const usdcBefore = await getAccount(provider.connection, bobUsdcAta);

      await program.methods
        .redeem(new anchor.BN(30))
        .accounts({
          user: bob.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: bobUsdcAta,
          userYes: bobYesAta,
          userNo: bobNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([bob])
        .rpc();

      const usdcAfter = await getAccount(provider.connection, bobUsdcAta);
      const yesAfter = await getAccount(provider.connection, bobYesAta);

      assert.equal(
        yesAfter.amount,
        0n,
        "Bob should have 0 Yes tokens after full redemption",
      );
      assert.equal(
        usdcAfter.amount - usdcBefore.amount,
        BigInt(30 * ONE_USDC),
        "Bob should receive exactly 30 USDC for remaining redemption",
      );
    });

    test("vault balance reaches zero after all redemptions", async () => {
      const vault = await getAccount(provider.connection, vaultPda);
      assert.equal(
        vault.amount,
        0n,
        "Vault should be completely drained after all winning tokens redeemed",
      );
    });

    test("reject: losing No holder cannot extract collateral", async () => {
      // Alice holds 30 No tokens (the losing side). Yes won, so all winning
      // OI is drained. Any redeem attempt fails at the state level.
      await assert.rejects(
        program.methods
          .redeem(new anchor.BN(1))
          .accounts({
            user: alice.publicKey,
            config: configPda,
            market: marketPda,
            vault: vaultPda,
            yesMint: yesMintPda,
            noMint: noMintPda,
            userUsdc: aliceUsdcAta,
            userYes: aliceYesAta,
            userNo: aliceNoAta,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([alice])
          .rpc(),
        /InsufficientWinningOpenInterest/,
        "Losing No holder should not be able to extract collateral",
      );
    });

    test("reject: double redemption after full drain", async () => {
      await assert.rejects(
        program.methods
          .redeem(new anchor.BN(1))
          .accounts({
            user: bob.publicKey,
            config: configPda,
            market: marketPda,
            vault: vaultPda,
            yesMint: yesMintPda,
            noMint: noMintPda,
            userUsdc: bobUsdcAta,
            userYes: bobYesAta,
            userNo: bobNoAta,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([bob])
          .rpc(),
        /InsufficientWinningOpenInterest/,
        "Double redemption should be rejected after all winning OI is drained",
      );
    });
  },
);
