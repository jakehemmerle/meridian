/**
 * CLI dependency builder — constructs DI objects from validated environment
 * for each automation job command.
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  MERIDIAN_TICKER_FEEDS,
  type MeridianTicker,
  type HermesPriceSnapshot,
  pythPriceToDollars,
  getTradingDaySchedule,
} from "@meridian/domain";

import type { BootstrapEnvValidation } from "./config/env.js";
import { getSettlementConfig } from "./config/settlement.js";
import { buildSolanaConnection, type SolanaConnection } from "./clients/solana.js";
import { loadKeypair } from "./clients/keypair.js";
import { fetchLatestPriceSnapshots } from "./clients/hermes.js";
import {
  makeClosePhoenixMarket,
  createPhoenixMarket as createPhoenixMarketFn,
  requestSeat,
  MERIDIAN_PHOENIX_DEFAULTS,
} from "./clients/phoenix.js";
import { makeCloseMeridianMarket } from "./clients/meridian.js";
import {
  deriveMarketPda,
  deriveAllMarketPdas,
  feedIdToBytes,
} from "./clients/pda.js";
import { discoverMarkets } from "./clients/market-discovery.js";

import type { MorningJobDeps } from "./jobs/morning-job.js";
import type { AfternoonJobDeps, AfternoonMarketEntry } from "./jobs/afternoon-job.js";
import type { MarketCloseJobDeps } from "./jobs/close-markets.js";
import type { SettleMarketsDeps, ActiveMarket } from "./jobs/settle-markets.js";

// ─── Ticker mapping ────────────────────────────────────────────────────────────

const TICKER_INDEX: Record<string, number> = {
  AAPL: 0, MSFT: 1, GOOGL: 2, AMZN: 3, NVDA: 4, META: 5, TSLA: 6,
};

const TICKER_NAMES: Record<number, string> = {
  0: "AAPL", 1: "MSFT", 2: "GOOGL", 3: "AMZN", 4: "NVDA", 5: "META", 6: "TSLA",
};

// ─── Anchor discriminators ─────────────────────────────────────────────────────

const ADMIN_SETTLE_OVERRIDE_DISCRIMINATOR = Buffer.from([
  92, 131, 189, 52, 161, 70, 203, 95,
]);

// ─── Shared setup ──────────────────────────────────────────────────────────────

interface BootstrapClients {
  connection: SolanaConnection;
  payer: Keypair;
  programId: PublicKey;
  usdcMint: PublicKey;
  program: anchor.Program;
  configPda: PublicKey;
}

async function buildClients(bootstrap: BootstrapEnvValidation): Promise<BootstrapClients> {
  const connection = buildSolanaConnection(bootstrap.env.SOLANA_RPC_URL);
  const payer = loadKeypair(bootstrap.resolvedPaths.anchorWalletPath);
  const programId = new PublicKey(bootstrap.publicKeys.programId);
  const usdcMint = new PublicKey(bootstrap.publicKeys.usdcMint);

  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = await anchor.Program.fetchIdl(programId, provider);
  if (!idl) {
    throw new Error("Failed to fetch Meridian IDL from on-chain");
  }
  const program = new anchor.Program(idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  );

  return { connection, payer, programId, usdcMint, program, configPda };
}

function computeTradingDay(date: Date): number {
  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

// ─── Morning job deps ──────────────────────────────────────────────────────────

export async function buildMorningDeps(
  bootstrap: BootstrapEnvValidation,
): Promise<MorningJobDeps> {
  const { connection, payer, programId, usdcMint, program, configPda } =
    await buildClients(bootstrap);

  const tradingDate = new Date();
  const tradingDay = computeTradingDay(tradingDate);

  // Shared state: price snapshots are fetched first, then used by createMarketOnChain
  const previousCloseMap = new Map<string, number>();

  // Reverse map: feed ID → ticker name
  const feedIdToTicker = new Map<string, MeridianTicker>();
  for (const [ticker, feedId] of Object.entries(MERIDIAN_TICKER_FEEDS)) {
    feedIdToTicker.set(feedId, ticker as MeridianTicker);
  }

  // Pre-generated Phoenix market keypairs, shared between createMarketOnChain and createPhoenixMarket
  const phoenixKeypairs = new Map<string, Keypair>();

  return {
    tradingDate,

    fetchPriceSnapshots: async (feedIds: readonly string[]) => {
      const snapshots = await fetchLatestPriceSnapshots(feedIds);
      for (const snap of snapshots) {
        const ticker = feedIdToTicker.get(snap.id);
        if (ticker) {
          previousCloseMap.set(
            ticker,
            pythPriceToDollars(snap.price.price, snap.price.expo),
          );
        }
      }
      return snapshots;
    },

    createMarketOnChain: async (
      ticker: string,
      strikePrice: number,
      marketCloseUtc: number,
    ) => {
      const tickerIndex = TICKER_INDEX[ticker];
      if (tickerIndex === undefined) {
        throw new Error(`Unknown ticker: ${ticker}`);
      }

      const strikePriceFp = BigInt(Math.round(strikePrice * 1_000_000));
      const previousClose = previousCloseMap.get(ticker) ?? strikePrice;
      const previousCloseFp = BigInt(Math.round(previousClose * 1_000_000));

      const [marketPda] = deriveMarketPda(programId, tickerIndex, tradingDay, strikePriceFp);
      const { vault, yesMint, noMint } = deriveAllMarketPdas(programId, marketPda);

      // Pre-generate Phoenix market keypair — shared with createPhoenixMarket
      const phoenixMarketKeypair = Keypair.generate();
      phoenixKeypairs.set(`${ticker}:${strikePrice}`, phoenixMarketKeypair);

      const feedId = MERIDIAN_TICKER_FEEDS[ticker as MeridianTicker];
      const oracleFeedIdBytes = Array.from(feedIdToBytes(feedId));

      const tickerEnum: Record<string, Record<string, never>> = {};
      tickerEnum[ticker.toLowerCase()] = {};

      const closeTimeTs = new anchor.BN(marketCloseUtc);
      const settleAfterTs = new anchor.BN(marketCloseUtc + 600);

      const sig = await (program.methods as any)
        .createMarket({
          ticker: tickerEnum,
          tradingDay,
          strikePrice: new anchor.BN(Number(strikePriceFp)),
          previousClose: new anchor.BN(Number(previousCloseFp)),
          closeTimeTs,
          settleAfterTs,
          oracleFeedId: oracleFeedIdBytes,
          phoenixMarket: phoenixMarketKeypair.publicKey,
        })
        .accounts({
          payer: payer.publicKey,
          operationsAuthority: payer.publicKey,
          config: configPda,
          market: marketPda,
          vault,
          yesMint,
          noMint,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      console.log(`Created Meridian market ${ticker} $${strikePrice}: ${marketPda.toBase58()} (tx: ${sig})`);

      return {
        meridianMarket: marketPda.toBase58(),
        yesMint: yesMint.toBase58(),
      };
    },

    createPhoenixMarket: async (
      ticker: string,
      strikePrice: number,
      _tradingDay: number,
      _meridianMarket: string,
      yesMint: string,
    ) => {
      const phoenixMarketKeypair = phoenixKeypairs.get(`${ticker}:${strikePrice}`);

      const { phoenixMarket } = await createPhoenixMarketFn(
        connection,
        payer,
        {
          ...MERIDIAN_PHOENIX_DEFAULTS,
          baseMint: new PublicKey(yesMint),
          quoteMint: usdcMint,
        },
        phoenixMarketKeypair,
      );

      await requestSeat(connection, payer, phoenixMarket, payer.publicKey);

      console.log(`Created Phoenix market for ${ticker} $${strikePrice}: ${phoenixMarket.toBase58()}`);

      return { phoenixMarket: phoenixMarket.toBase58() };
    },
  };
}

// ─── Afternoon job deps ────────────────────────────────────────────────────────

export async function buildAfternoonDeps(
  bootstrap: BootstrapEnvValidation,
): Promise<AfternoonJobDeps> {
  const { connection, payer, programId, program, configPda } =
    await buildClients(bootstrap);

  const settlementConfig = getSettlementConfig(bootstrap.env);

  const discovered = await discoverMarkets(program);
  const tradingMarkets = discovered.filter((m) => m.phase === "trading");

  if (tradingMarkets.length === 0) {
    console.log("No trading markets found on-chain.");
  } else {
    console.log(`Found ${tradingMarkets.length} trading markets to close and settle.`);
  }

  const activeMarkets: AfternoonMarketEntry[] = tradingMarkets.map((m) => ({
    ticker: TICKER_NAMES[m.ticker] ?? `UNKNOWN_${m.ticker}`,
    strikePrice: m.strikePrice.toNumber() / 1_000_000,
    meridianMarket: m.pda.toBase58(),
    phoenixMarket: m.phoenixMarket.toBase58(),
    marketCloseUtc: m.closeTimeTs,
  }));

  return {
    activeMarkets,
    closePhoenixMarket: makeClosePhoenixMarket(connection, payer),
    closeMeridianMarket: makeCloseMeridianMarket(connection, payer, programId),
    fetchSettlementPrice: makeSettlementPriceFetcher(),
    settleMarketOnChain: makeAdminSettleOverride(connection, payer, programId, configPda),
    retryConfig: settlementConfig.retryConfig,
  };
}

// ─── Close job deps ────────────────────────────────────────────────────────────

export async function buildCloseDeps(
  bootstrap: BootstrapEnvValidation,
): Promise<MarketCloseJobDeps> {
  const { connection, payer, programId, program } = await buildClients(bootstrap);

  const discovered = await discoverMarkets(program);
  const tradingMarkets = discovered.filter((m) => m.phase === "trading");

  console.log(`Found ${tradingMarkets.length} trading markets to close.`);

  return {
    activeMarkets: tradingMarkets.map((m) => ({
      ticker: TICKER_NAMES[m.ticker] ?? `UNKNOWN_${m.ticker}`,
      strikePrice: m.strikePrice.toNumber() / 1_000_000,
      meridianMarket: m.pda.toBase58(),
      phoenixMarket: m.phoenixMarket.toBase58(),
    })),
    closePhoenixMarket: makeClosePhoenixMarket(connection, payer),
    closeMeridianMarket: makeCloseMeridianMarket(connection, payer, programId),
  };
}

// ─── Settle job deps ───────────────────────────────────────────────────────────

export async function buildSettleDeps(
  bootstrap: BootstrapEnvValidation,
): Promise<SettleMarketsDeps> {
  const { connection, payer, programId, program, configPda } =
    await buildClients(bootstrap);

  const settlementConfig = getSettlementConfig(bootstrap.env);

  const discovered = await discoverMarkets(program);
  const closedMarkets = discovered.filter((m) => m.phase === "closed");

  console.log(`Found ${closedMarkets.length} closed markets to settle.`);

  const activeMarkets: ActiveMarket[] = closedMarkets.map((m) => ({
    ticker: TICKER_NAMES[m.ticker] ?? `UNKNOWN_${m.ticker}`,
    strikePrice: m.strikePrice.toNumber() / 1_000_000,
    meridianMarket: m.pda.toBase58(),
    marketCloseUtc: m.closeTimeTs,
  }));

  return {
    activeMarkets,
    fetchSettlementPrice: makeSettlementPriceFetcher(),
    settleMarketOnChain: makeAdminSettleOverride(connection, payer, programId, configPda),
    retryConfig: settlementConfig.retryConfig,
  };
}

// ─── Settlement helpers ────────────────────────────────────────────────────────

/**
 * Create a fetchSettlementPrice function that fetches the latest price from
 * Hermes (Pyth oracle service).
 *
 * Uses latest prices rather than at-close prices because we settle via
 * admin_settle_override (which doesn't verify oracle timestamps on-chain).
 * When the oracle-based settle path is ready (me-7tr), this should use
 * fetchHermesPriceUpdatesAtTimestamp instead.
 */
function makeSettlementPriceFetcher(): (
  ticker: string,
  marketCloseUtc: number,
) => Promise<HermesPriceSnapshot> {
  return async (ticker: string, _marketCloseUtc: number) => {
    const feedId = MERIDIAN_TICKER_FEEDS[ticker as MeridianTicker];
    if (!feedId) {
      throw new Error(`No Pyth feed configured for ticker: ${ticker}`);
    }

    const snapshots = await fetchLatestPriceSnapshots([feedId]);

    if (snapshots.length === 0) {
      throw new Error(`No price snapshot found for ${ticker}`);
    }

    return snapshots[0];
  };
}

/**
 * Settle via admin_settle_override instruction.
 *
 * Uses the admin authority to set the settlement price directly, bypassing
 * the on-chain oracle verification. This is the current approach until
 * the Pyth receiver integration is complete (blocked by me-7tr).
 */
function makeAdminSettleOverride(
  connection: SolanaConnection,
  adminAuthority: Keypair,
  programId: PublicKey,
  configPda: PublicKey,
): (
  market: ActiveMarket,
  snapshot: HermesPriceSnapshot,
) => Promise<{ settled: boolean; txSignature: string }> {
  return async (market, snapshot) => {
    const price = pythPriceToDollars(snapshot.price.price, snapshot.price.expo);
    const overridePrice = BigInt(Math.round(price * 1_000_000));

    const marketPubkey = new PublicKey(market.meridianMarket);

    // Build admin_settle_override instruction
    const data = Buffer.alloc(16);
    ADMIN_SETTLE_OVERRIDE_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(overridePrice, 8);

    const ix = new anchor.web3.TransactionInstruction({
      programId,
      keys: [
        { pubkey: adminAuthority.publicKey, isWritable: false, isSigner: true },
        { pubkey: configPda, isWritable: false, isSigner: false },
        { pubkey: marketPubkey, isWritable: true, isSigner: false },
      ],
      data,
    });

    const tx = new anchor.web3.Transaction().add(ix);
    const txSignature = await connection.sendTransaction(tx, [adminAuthority]);
    await connection.confirmTransaction(txSignature, "confirmed");

    console.log(
      `Settled ${market.ticker} $${market.strikePrice} at $${price.toFixed(2)} (tx: ${txSignature})`,
    );

    return { settled: true, txSignature };
  };
}
