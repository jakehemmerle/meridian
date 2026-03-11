import assert from "node:assert/strict";
import test, { describe } from "node:test";

import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";

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

describe("mint_merge_pause", { skip: !process.env.ANCHOR_PROVIDER_URL }, () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const adminAuthority = anchor.web3.Keypair.generate();
  const operationsAuthority = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  let usdcMint: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;
  let marketPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let yesMintPda: anchor.web3.PublicKey;
  let noMintPda: anchor.web3.PublicKey;
  let userUsdcAta: anchor.web3.PublicKey;
  let userYesAta: anchor.web3.PublicKey;
  let userNoAta: anchor.web3.PublicKey;

  const TRADING_DAY = 20260312; // Different day to avoid collision with create-market tests
  const STRIKE_PRICE = BigInt(200 * ONE_USDC);

  test("setup: initialize config, market, and user accounts", async () => {
    // Airdrop
    await Promise.all([
      provider.connection.requestAirdrop(adminAuthority.publicKey, 2e9),
      provider.connection.requestAirdrop(operationsAuthority.publicKey, 2e9),
      provider.connection.requestAirdrop(user.publicKey, 2e9),
    ]);
    await new Promise((r) => setTimeout(r, 1000));

    // Create USDC mint
    usdcMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    // Initialize config
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

    // Derive market PDAs
    [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    [yesMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [YES_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );
    [noMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [NO_MINT_SEED, marketPda.toBuffer()],
      PROGRAM_ID,
    );

    // Create market
    await program.methods
      .createMarket({
        ticker: { aapl: {} },
        tradingDay: TRADING_DAY,
        strikePrice: new anchor.BN(Number(STRIKE_PRICE)),
        previousClose: new anchor.BN(198 * ONE_USDC),
        closeTimeTs: new anchor.BN(1_763_504_400),
        settleAfterTs: new anchor.BN(1_763_504_400 + 600),
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

    // Create user ATAs
    userUsdcAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      usdcMint,
      user.publicKey,
    );
    userYesAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      yesMintPda,
      user.publicKey,
    );
    userNoAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      noMintPda,
      user.publicKey,
    );

    // Mint USDC to user (100 USDC)
    await mintTo(
      provider.connection,
      payer,
      usdcMint,
      userUsdcAta,
      payer.publicKey,
      100 * ONE_USDC,
    );
  });

  test("mint happy path: deposit USDC, receive Yes+No tokens", async () => {
    const pairs = 5;

    await program.methods
      .mintPair(new anchor.BN(pairs))
      .accounts({
        user: user.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        userUsdc: userUsdcAta,
        userYes: userYesAta,
        userNo: userNoAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    // Check vault received USDC
    const vaultAccount = await getAccount(provider.connection, vaultPda);
    assert.equal(Number(vaultAccount.amount), pairs * ONE_USDC);

    // Check user received Yes and No tokens
    const yesAccount = await getAccount(provider.connection, userYesAta);
    assert.equal(Number(yesAccount.amount), pairs * ONE_USDC);

    const noAccount = await getAccount(provider.connection, userNoAta);
    assert.equal(Number(noAccount.amount), pairs * ONE_USDC);

    // Check market state
    const market = await program.account.meridianMarket.fetch(marketPda);
    assert.equal(market.yesOpenInterest.toNumber(), pairs);
    assert.equal(market.noOpenInterest.toNumber(), pairs);
    assert.equal(market.totalCollateralDeposited.toNumber(), pairs);
  });

  test("merge happy path: burn Yes+No, receive USDC back", async () => {
    const pairs = 2;

    await program.methods
      .mergePair(new anchor.BN(pairs))
      .accounts({
        user: user.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        userUsdc: userUsdcAta,
        userYes: userYesAta,
        userNo: userNoAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    // Vault should have 3 USDC left (5 minted - 2 merged)
    const vaultAccount = await getAccount(provider.connection, vaultPda);
    assert.equal(Number(vaultAccount.amount), 3 * ONE_USDC);

    // User should have 3 Yes and 3 No
    const yesAccount = await getAccount(provider.connection, userYesAta);
    assert.equal(Number(yesAccount.amount), 3 * ONE_USDC);

    const noAccount = await getAccount(provider.connection, userNoAta);
    assert.equal(Number(noAccount.amount), 3 * ONE_USDC);

    // Market state
    const market = await program.account.meridianMarket.fetch(marketPda);
    assert.equal(market.yesOpenInterest.toNumber(), 3);
    assert.equal(market.noOpenInterest.toNumber(), 3);
    assert.equal(market.totalCollateralReturned.toNumber(), 2);
  });

  test("pause blocks mint", async () => {
    // Pause
    await program.methods
      .pauseProtocol()
      .accounts({
        adminAuthority: adminAuthority.publicKey,
        config: configPda,
      })
      .signers([adminAuthority])
      .rpc();

    // Mint should fail
    await assert.rejects(
      program.methods
        .mintPair(new anchor.BN(1))
        .accounts({
          user: user.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: userUsdcAta,
          userYes: userYesAta,
          userNo: userNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc(),
    );
  });

  test("pause blocks merge", async () => {
    await assert.rejects(
      program.methods
        .mergePair(new anchor.BN(1))
        .accounts({
          user: user.publicKey,
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          yesMint: yesMintPda,
          noMint: noMintPda,
          userUsdc: userUsdcAta,
          userYes: userYesAta,
          userNo: userNoAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc(),
    );
  });

  test("unpause re-enables operations", async () => {
    await program.methods
      .unpauseProtocol()
      .accounts({
        adminAuthority: adminAuthority.publicKey,
        config: configPda,
      })
      .signers([adminAuthority])
      .rpc();

    // Mint should work again
    await program.methods
      .mintPair(new anchor.BN(1))
      .accounts({
        user: user.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        userUsdc: userUsdcAta,
        userYes: userYesAta,
        userNo: userNoAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const market = await program.account.meridianMarket.fetch(marketPda);
    assert.equal(market.yesOpenInterest.toNumber(), 4);
  });

  test("non-admin cannot pause", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    await provider.connection.requestAirdrop(nonAdmin.publicKey, 1e9);
    await new Promise((r) => setTimeout(r, 500));

    await assert.rejects(
      program.methods
        .pauseProtocol()
        .accounts({
          adminAuthority: nonAdmin.publicKey,
          config: configPda,
        })
        .signers([nonAdmin])
        .rpc(),
    );
  });
});
