import {
  PublicKey,
  SystemProgram,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getLogAuthority,
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
  getSeatAddress,
  createRequestSeatInstruction,
} from "@ellipsis-labs/phoenix-sdk";
import * as anchor from "@coral-xyz/anchor";

import { browserWalletTest } from "./browser-wallet";

const MERIDIAN_PROGRAM_ID = new PublicKey(
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

const META_FEED_ID = new Uint8Array(
  "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe"
    .match(/.{2}/g)!
    .map((b) => parseInt(b, 16)),
);

// Ticker enum indices matching Rust enum order
const TICKER_AAPL = 0;
const TICKER_META = 5;

const TRADING_DAY = 20260314;

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

export interface MarketInfo {
  marketPda: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  vaultPda: PublicKey;
  ticker: number;
  strikePrice: bigint;
}

export interface MarketDataFixture {
  configPda: PublicKey;
  aaplMarket: MarketInfo;
  metaMarket: MarketInfo;
  phoenixMarket: PublicKey;
  program: anchor.Program;
  /** Create a new market on-chain and return its info */
  createMarket(
    ticker: number,
    strikePrice: bigint,
    feedId: Uint8Array,
    opts?: { pastCloseTime?: boolean },
  ): Promise<MarketInfo>;
  /** Transfer Yes tokens from test wallet to throwaway address */
  transferYesTokens(market: MarketInfo, amount: number): Promise<void>;
  /** Settle a market using admin override */
  settleMarket(market: MarketInfo, overridePrice: bigint): Promise<void>;
  /** Mint additional pairs for a market */
  mintPairs(market: MarketInfo, pairs: number): Promise<void>;
}

async function createMeridianMarket(
  program: anchor.Program,
  keypair: Keypair,
  configPda: PublicKey,
  usdcMint: PublicKey,
  ticker: number,
  tradingDay: number,
  strikePrice: bigint,
  feedId: Uint8Array,
  closeTimeTs: anchor.BN,
  settleAfterTs: anchor.BN,
  phoenixMarketPubkey: PublicKey,
): Promise<MarketInfo> {
  const [marketPda] = deriveMarketPda(ticker, tradingDay, strikePrice);
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, marketPda.toBuffer()],
    MERIDIAN_PROGRAM_ID,
  );
  const [yesMint] = PublicKey.findProgramAddressSync(
    [YES_MINT_SEED, marketPda.toBuffer()],
    MERIDIAN_PROGRAM_ID,
  );
  const [noMint] = PublicKey.findProgramAddressSync(
    [NO_MINT_SEED, marketPda.toBuffer()],
    MERIDIAN_PROGRAM_ID,
  );

  const tickerVariant: Record<string, object> = {};
  const tickerNames = ["aapl", "msft", "googl", "amzn", "nvda", "meta", "tsla"];
  tickerVariant[tickerNames[ticker]] = {};

  await program.methods
    .createMarket({
      ticker: tickerVariant,
      tradingDay,
      strikePrice: new anchor.BN(Number(strikePrice)),
      previousClose: new anchor.BN(Number(strikePrice) - 2_000_000),
      closeTimeTs,
      settleAfterTs,
      oracleFeedId: Array.from(feedId),
      phoenixMarket: phoenixMarketPubkey,
    })
    .accounts({
      payer: keypair.publicKey,
      operationsAuthority: keypair.publicKey,
      config: configPda,
      market: marketPda,
      vault: vaultPda,
      yesMint,
      noMint,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([keypair])
    .rpc();

  return { marketPda, yesMint, noMint, vaultPda, ticker, strikePrice };
}

export const marketDataTest = browserWalletTest.extend<{
  marketData: MarketDataFixture;
}>({
  marketData: async ({ wallet, validator }, use) => {
    const { connection, keypair, usdcMint } = wallet;

    const anchorWallet = new anchor.Wallet(keypair);
    const anchorConnection = new anchor.web3.Connection(
      validator.rpcUrl,
      "confirmed",
    );
    const provider = new anchor.AnchorProvider(
      anchorConnection,
      anchorWallet,
      { commitment: "confirmed" },
    );

    const idl = await anchor.Program.fetchIdl(MERIDIAN_PROGRAM_ID, provider);
    if (!idl) {
      throw new Error("Could not fetch Meridian IDL from validator");
    }
    const program = new anchor.Program(idl, provider);

    // Initialize config
    const [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      MERIDIAN_PROGRAM_ID,
    );

    await program.methods
      .initializeConfig({
        adminAuthority: keypair.publicKey,
        operationsAuthority: keypair.publicKey,
        usdcMint,
        pythReceiverProgram: Keypair.generate().publicKey,
        oracleMaximumAgeSeconds: 600,
        oracleConfidenceLimitBps: 250,
      })
      .accounts({
        payer: keypair.publicKey,
        adminAuthority: keypair.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([keypair])
      .rpc();

    const futureCloseTime = new anchor.BN(1_763_504_400);
    const futureSettleAfter = new anchor.BN(1_763_504_400 + 600);
    const phoenixPlaceholder = Keypair.generate().publicKey;

    // Create AAPL market ($200 strike)
    const aaplMarket = await createMeridianMarket(
      program,
      keypair,
      configPda,
      usdcMint,
      TICKER_AAPL,
      TRADING_DAY,
      BigInt(200_000_000),
      AAPL_FEED_ID,
      futureCloseTime,
      futureSettleAfter,
      phoenixPlaceholder,
    );

    // Create META market ($680 strike)
    const metaMarket = await createMeridianMarket(
      program,
      keypair,
      configPda,
      usdcMint,
      TICKER_META,
      TRADING_DAY,
      BigInt(680_000_000),
      META_FEED_ID,
      futureCloseTime,
      futureSettleAfter,
      phoenixPlaceholder,
    );

    // Create ATAs for AAPL Yes/No tokens and mint 5 pairs
    const userYesAta = getAssociatedTokenAddressSync(
      aaplMarket.yesMint,
      keypair.publicKey,
    );
    const userNoAta = getAssociatedTokenAddressSync(
      aaplMarket.noMint,
      keypair.publicKey,
    );
    const userUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      keypair.publicKey,
    );

    const createAtasTx = new Transaction();
    createAtasTx.add(
      createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        userYesAta,
        keypair.publicKey,
        aaplMarket.yesMint,
      ),
      createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        userNoAta,
        keypair.publicKey,
        aaplMarket.noMint,
      ),
    );
    const ataSig = await connection.sendTransaction(createAtasTx, [keypair]);
    await connection.confirmTransaction(ataSig, "confirmed");

    // Mint 5 pairs on AAPL (costs 5 USDC)
    await program.methods
      .mintPair(new anchor.BN(5_000_000))
      .accounts({
        user: keypair.publicKey,
        config: configPda,
        market: aaplMarket.marketPda,
        vault: aaplMarket.vaultPda,
        yesMint: aaplMarket.yesMint,
        noMint: aaplMarket.noMint,
        userUsdc: userUsdcAta,
        userYes: userYesAta,
        userNo: userNoAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([keypair])
      .rpc();

    // Helper functions exposed to tests
    async function createMarket(
      ticker: number,
      strikePrice: bigint,
      feedId: Uint8Array,
      opts?: { pastCloseTime?: boolean },
    ): Promise<MarketInfo> {
      const closeTime = opts?.pastCloseTime
        ? new anchor.BN(1_000_000) // Far in the past
        : futureCloseTime;
      const settleAfter = opts?.pastCloseTime
        ? new anchor.BN(1_000_600) // Past + 600s
        : futureSettleAfter;
      // Use a different trading day for past-close markets to avoid PDA collision
      const day = opts?.pastCloseTime ? TRADING_DAY - 1 : TRADING_DAY;

      return createMeridianMarket(
        program,
        keypair,
        configPda,
        usdcMint,
        ticker,
        day,
        strikePrice,
        feedId,
        closeTime,
        settleAfter,
        phoenixPlaceholder,
      );
    }

    async function transferYesTokens(
      market: MarketInfo,
      amount: number,
    ): Promise<void> {
      const source = getAssociatedTokenAddressSync(
        market.yesMint,
        keypair.publicKey,
      );
      const throwaway = Keypair.generate();
      const dest = getAssociatedTokenAddressSync(
        market.yesMint,
        throwaway.publicKey,
      );

      const tx = new Transaction();
      tx.add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          dest,
          throwaway.publicKey,
          market.yesMint,
        ),
        createTransferInstruction(source, dest, keypair.publicKey, amount),
      );
      const sig = await connection.sendTransaction(tx, [keypair]);
      await connection.confirmTransaction(sig, "confirmed");
    }

    async function settleMarket(
      market: MarketInfo,
      overridePrice: bigint,
    ): Promise<void> {
      // First close the market
      await program.methods
        .closeMarket()
        .accounts({
          operationsAuthority: keypair.publicKey,
          config: configPda,
          market: market.marketPda,
        })
        .signers([keypair])
        .rpc();

      // Then admin settle override
      await program.methods
        .adminSettleOverride(new anchor.BN(Number(overridePrice)))
        .accounts({
          adminAuthority: keypair.publicKey,
          config: configPda,
          market: market.marketPda,
        })
        .signers([keypair])
        .rpc();
    }

    async function mintPairs(
      market: MarketInfo,
      pairs: number,
    ): Promise<void> {
      const userYes = getAssociatedTokenAddressSync(
        market.yesMint,
        keypair.publicKey,
      );
      const userNo = getAssociatedTokenAddressSync(
        market.noMint,
        keypair.publicKey,
      );

      // Ensure ATAs exist
      const tx = new Transaction();
      try {
        await getAccount(connection, userYes);
      } catch {
        tx.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            userYes,
            keypair.publicKey,
            market.yesMint,
          ),
        );
      }
      try {
        await getAccount(connection, userNo);
      } catch {
        tx.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            userNo,
            keypair.publicKey,
            market.noMint,
          ),
        );
      }
      if (tx.instructions.length > 0) {
        const sig = await connection.sendTransaction(tx, [keypair]);
        await connection.confirmTransaction(sig, "confirmed");
      }

      await program.methods
        .mintPair(new anchor.BN(pairs))
        .accounts({
          user: keypair.publicKey,
          config: configPda,
          market: market.marketPda,
          vault: market.vaultPda,
          yesMint: market.yesMint,
          noMint: market.noMint,
          userUsdc: getAssociatedTokenAddressSync(usdcMint, keypair.publicKey),
          userYes: userYes,
          userNo: userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([keypair])
        .rpc();
    }

    await use({
      configPda,
      aaplMarket,
      metaMarket,
      phoenixMarket: phoenixPlaceholder,
      program,
      createMarket,
      transferYesTokens,
      settleMarket,
      mintPairs,
    });
  },
});
