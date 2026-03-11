import assert from "node:assert/strict";
import test, { describe } from "node:test";

import * as anchor from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";

import type { Meridian } from "../../../target/types/meridian.js";

const PROGRAM_ID = new anchor.web3.PublicKey(
  process.env.MERIDIAN_PROGRAM_ID ?? "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
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
): [anchor.web3.PublicKey, number] {
  const tradingDayBuf = Buffer.alloc(4);
  tradingDayBuf.writeUInt32LE(tradingDay);
  const strikePriceBuf = Buffer.alloc(8);
  strikePriceBuf.writeBigUInt64LE(strikePrice);

  return anchor.web3.PublicKey.findProgramAddressSync(
    [MARKET_SEED, Buffer.from([ticker]), tradingDayBuf, strikePriceBuf],
    PROGRAM_ID,
  );
}

describe("add_strike", { skip: !process.env.ANCHOR_PROVIDER_URL }, () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const adminAuthority = anchor.web3.Keypair.generate();
  const operationsAuthority = anchor.web3.Keypair.generate();
  let usdcMint: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;

  const TRADING_DAY = 20260313; // Different day to avoid collision
  const BASE_STRIKE = BigInt(200 * ONE_USDC);
  const NEW_STRIKE = BigInt(250 * ONE_USDC);

  // Far future close time so add_strike doesn't fail the time check
  const CLOSE_TIME_TS = Math.floor(Date.now() / 1000) + 86400;
  const SETTLE_AFTER_TS = CLOSE_TIME_TS + 600;

  test("setup: initialize config and base market", async () => {
    await Promise.all([
      provider.connection.requestAirdrop(adminAuthority.publicKey, 2e9),
      provider.connection.requestAirdrop(operationsAuthority.publicKey, 2e9),
    ]);
    await new Promise((r) => setTimeout(r, 1000));

    usdcMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    [configPda] = anchor.web3.PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);

    await program.methods
      .initializeConfig({
        adminAuthority: adminAuthority.publicKey,
        operationsAuthority: operationsAuthority.publicKey,
        usdcMint,
        pythReceiverProgram: anchor.web3.Keypair.generate().publicKey,
        oracleMaximumAgeSeconds: 600,
        oracleConfidenceLimitBps: 250,
      })
      .accounts({
        payer: payer.publicKey,
        adminAuthority: adminAuthority.publicKey,
        config: configPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer, adminAuthority])
      .rpc();

    // Create base market via create_market
    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, BASE_STRIKE);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [yesMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [YES_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [noMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [NO_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );

    await program.methods
      .createMarket({
        ticker: { aapl: {} },
        tradingDay: TRADING_DAY,
        strikePrice: new anchor.BN(Number(BASE_STRIKE)),
        previousClose: new anchor.BN(198 * ONE_USDC),
        closeTimeTs: new anchor.BN(CLOSE_TIME_TS),
        settleAfterTs: new anchor.BN(SETTLE_AFTER_TS),
        oracleFeedId: Array.from(AAPL_FEED_ID),
        phoenixMarket: anchor.web3.Keypair.generate().publicKey,
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
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer, operationsAuthority])
      .rpc();
  });

  test("happy path: admin adds new strike for existing trading day", async () => {
    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, NEW_STRIKE);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [yesMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [YES_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [noMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [NO_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );

    await program.methods
      .addStrike({
        ticker: { aapl: {} },
        tradingDay: TRADING_DAY,
        strikePrice: new anchor.BN(Number(NEW_STRIKE)),
        previousClose: new anchor.BN(198 * ONE_USDC),
        closeTimeTs: new anchor.BN(CLOSE_TIME_TS),
        settleAfterTs: new anchor.BN(SETTLE_AFTER_TS),
        oracleFeedId: Array.from(AAPL_FEED_ID),
        phoenixMarket: anchor.web3.Keypair.generate().publicKey,
      })
      .accounts({
        payer: payer.publicKey,
        adminAuthority: adminAuthority.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        usdcMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer, adminAuthority])
      .rpc();

    const market = await program.account.meridianMarket.fetch(marketPda);
    assert.deepEqual(market.phase, { trading: {} });
    assert.equal(market.strikePrice.toNumber(), Number(NEW_STRIKE));
    assert.equal(market.tradingDay, TRADING_DAY);
  });

  test("non-admin rejected: wrong signer", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    await provider.connection.requestAirdrop(nonAdmin.publicKey, 1e9);
    await new Promise((r) => setTimeout(r, 500));

    const anotherStrike = BigInt(300 * ONE_USDC);
    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, anotherStrike);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [yesMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [YES_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [noMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [NO_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );

    await assert.rejects(
      program.methods
        .addStrike({
          ticker: { aapl: {} },
          tradingDay: TRADING_DAY,
          strikePrice: new anchor.BN(Number(anotherStrike)),
          previousClose: new anchor.BN(198 * ONE_USDC),
          closeTimeTs: new anchor.BN(CLOSE_TIME_TS),
          settleAfterTs: new anchor.BN(SETTLE_AFTER_TS),
          oracleFeedId: Array.from(AAPL_FEED_ID),
          phoenixMarket: anchor.web3.Keypair.generate().publicKey,
        })
        .accounts({
          payer: payer.publicKey,
          adminAuthority: nonAdmin.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          usdcMint,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer, nonAdmin])
        .rpc(),
    );
  });

  test("duplicate rejected: same ticker+day+strike fails", async () => {
    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, NEW_STRIKE);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [yesMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [YES_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [noMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [NO_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );

    await assert.rejects(
      program.methods
        .addStrike({
          ticker: { aapl: {} },
          tradingDay: TRADING_DAY,
          strikePrice: new anchor.BN(Number(NEW_STRIKE)),
          previousClose: new anchor.BN(198 * ONE_USDC),
          closeTimeTs: new anchor.BN(CLOSE_TIME_TS),
          settleAfterTs: new anchor.BN(SETTLE_AFTER_TS),
          oracleFeedId: Array.from(AAPL_FEED_ID),
          phoenixMarket: anchor.web3.Keypair.generate().publicKey,
        })
        .accounts({
          payer: payer.publicKey,
          adminAuthority: adminAuthority.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          usdcMint,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer, adminAuthority])
        .rpc(),
    );
  });

  test("post-close rejected: clock past close time", async () => {
    const pastCloseStrike = BigInt(275 * ONE_USDC);
    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, pastCloseStrike);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [yesMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [YES_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    const [noMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [NO_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );

    // Use a close time in the past
    const pastCloseTs = Math.floor(Date.now() / 1000) - 3600;
    const pastSettleTs = pastCloseTs + 600;

    await assert.rejects(
      program.methods
        .addStrike({
          ticker: { aapl: {} },
          tradingDay: TRADING_DAY,
          strikePrice: new anchor.BN(Number(pastCloseStrike)),
          previousClose: new anchor.BN(198 * ONE_USDC),
          closeTimeTs: new anchor.BN(pastCloseTs),
          settleAfterTs: new anchor.BN(pastSettleTs),
          oracleFeedId: Array.from(AAPL_FEED_ID),
          phoenixMarket: anchor.web3.Keypair.generate().publicKey,
        })
        .accounts({
          payer: payer.publicKey,
          adminAuthority: adminAuthority.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          usdcMint,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer, adminAuthority])
        .rpc(),
    );
  });
});
