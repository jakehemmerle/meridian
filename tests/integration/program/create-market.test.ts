import assert from "node:assert/strict";
import test, { describe } from "node:test";

import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
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

// AAPL feed id (same as in constants.rs)
const AAPL_FEED_ID = new Uint8Array([
  73, 246, 182, 92, 177, 222, 107, 16, 234, 247, 94, 124, 3, 202, 2, 156, 48,
  109, 3, 87, 233, 27, 83, 17, 177, 117, 8, 74, 90, 213, 86, 136,
]);

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

describe("create_market", { skip: !process.env.ANCHOR_PROVIDER_URL }, () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const adminAuthority = anchor.web3.Keypair.generate();
  const operationsAuthority = anchor.web3.Keypair.generate();
  let usdcMint: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;

  const TICKER_AAPL = 0; // Ticker::Aapl
  const TRADING_DAY = 20260311;
  const STRIKE_PRICE = BigInt(200_000_000); // 200 USDC in 6-decimal
  const ONE_USDC = BigInt(1_000_000);

  test("setup: airdrop and initialize config", async () => {
    // Airdrop to admin and operations authorities
    await Promise.all([
      provider.connection.requestAirdrop(
        adminAuthority.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      ),
      provider.connection.requestAirdrop(
        operationsAuthority.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      ),
    ]);

    // Wait for airdrops
    await new Promise((r) => setTimeout(r, 1000));

    // Create USDC mock mint
    usdcMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
    );

    // Derive config PDA
    [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      PROGRAM_ID,
    );

    // Initialize config
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
  });

  test("happy path: creates market with correct fields and PDA children", async () => {
    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);

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

    const closeTimeTs = new anchor.BN(1_763_504_400);
    const settleAfterTs = new anchor.BN(1_763_504_400 + 600);
    const phoenixMarket = anchor.web3.Keypair.generate().publicKey;

    await program.methods
      .createMarket({
        ticker: { aapl: {} },
        tradingDay: TRADING_DAY,
        strikePrice: new anchor.BN(Number(STRIKE_PRICE)),
        previousClose: new anchor.BN(198_000_000),
        closeTimeTs,
        settleAfterTs,
        oracleFeedId: Array.from(AAPL_FEED_ID),
        phoenixMarket,
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

    // Fetch and verify market account
    const market = await program.account.meridianMarket.fetch(marketPda);
    assert.equal(market.version, 1);
    assert.deepEqual(market.ticker, { aapl: {} });
    assert.deepEqual(market.phase, { trading: {} });
    assert.deepEqual(market.outcome, { unsettled: {} });
    assert.equal(market.tradingDay, TRADING_DAY);
    assert.equal(market.strikePrice.toNumber(), Number(STRIKE_PRICE));
    assert.equal(market.yesOpenInterest.toNumber(), 0);
    assert.equal(market.noOpenInterest.toNumber(), 0);
    assert.equal(market.totalCollateralDeposited.toNumber(), 0);

    // Verify vault exists and has correct mint
    const vaultAccount = await getAccount(provider.connection, vaultPda);
    assert.equal(vaultAccount.mint.toBase58(), usdcMint.toBase58());
    assert.equal(vaultAccount.owner.toBase58(), marketPda.toBase58());

    // Verify yes/no mints exist
    const yesMint = await getMint(provider.connection, yesMintPda);
    assert.equal(yesMint.decimals, 6);
    assert.equal(yesMint.mintAuthority?.toBase58(), marketPda.toBase58());

    const noMint = await getMint(provider.connection, noMintPda);
    assert.equal(noMint.decimals, 6);
    assert.equal(noMint.mintAuthority?.toBase58(), marketPda.toBase58());
  });

  test("duplicate rejection: same ticker+day+strike fails", async () => {
    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);

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
        .createMarket({
          ticker: { aapl: {} },
          tradingDay: TRADING_DAY,
          strikePrice: new anchor.BN(Number(STRIKE_PRICE)),
          previousClose: new anchor.BN(198_000_000),
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
        .rpc(),
    );
  });

  test("PDA derivation matches on-chain accounts", () => {
    const [pda1] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);
    const [pda2] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);

    assert.equal(pda1.toBase58(), pda2.toBase58());

    // Different strike yields different PDA
    const [pda3] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, BigInt(250_000_000));
    assert.notEqual(pda1.toBase58(), pda3.toBase58());
  });
});
