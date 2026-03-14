import { PublicKey, SystemProgram, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
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

export interface MarketFixture {
  marketPda: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  vaultPda: PublicKey;
  phoenixMarket: PublicKey;
  configPda: PublicKey;
}

/**
 * Market fixture that creates a complete Meridian market ready for trading:
 * - Initializes MeridianConfig
 * - Creates a MeridianMarket (AAPL, strike 200)
 * - Creates Phoenix market for the Yes mint
 * - Requests + approves seat for the test wallet
 */
export const marketTest = browserWalletTest.extend<{ market: MarketFixture }>({
  market: async ({ wallet, validator }, use) => {
    const { connection, keypair, usdcMint } = wallet;

    // Set up Anchor provider pointing at our validator
    const anchorWallet = new anchor.Wallet(keypair);
    const anchorConnection = new anchor.web3.Connection(validator.rpcUrl, "confirmed");
    const provider = new anchor.AnchorProvider(anchorConnection, anchorWallet, {
      commitment: "confirmed",
    });

    // We need the IDL — load it dynamically
    const idl = await anchor.Program.fetchIdl(MERIDIAN_PROGRAM_ID, provider);
    if (!idl) {
      throw new Error("Could not fetch Meridian IDL from validator. Is meridian.so loaded?");
    }
    const program = new anchor.Program(idl, provider);

    // Step 1: Initialize config
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

    // Step 2: Create Meridian market
    const TICKER_AAPL = 0;
    const TRADING_DAY = 20260314;
    const STRIKE_PRICE = BigInt(200_000_000);

    const [marketPda] = deriveMarketPda(TICKER_AAPL, TRADING_DAY, STRIKE_PRICE);
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

    const phoenixPlaceholder = Keypair.generate().publicKey;
    const closeTimeTs = new anchor.BN(1_763_504_400);
    const settleAfterTs = new anchor.BN(1_763_504_400 + 600);

    await program.methods
      .createMarket({
        ticker: { aapl: {} },
        tradingDay: TRADING_DAY,
        strikePrice: new anchor.BN(Number(STRIKE_PRICE)),
        previousClose: new anchor.BN(198_000_000),
        closeTimeTs,
        settleAfterTs,
        oracleFeedId: Array.from(AAPL_FEED_ID),
        phoenixMarket: phoenixPlaceholder,
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
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([keypair])
      .rpc();

    // Step 3: Create Phoenix market for the Yes mint
    const phoenixMarketKeypair = Keypair.generate();
    const bidsSize = 512n;
    const asksSize = 512n;
    const numSeats = 128n;

    // Compute market account size
    const headerSize = 576;
    const orderSlotSize = 80;
    const traderStateSize = 128;
    const overhead = 8192;
    const marketSize =
      headerSize +
      Number(bidsSize + asksSize) * orderSlotSize +
      Number(numSeats) * traderStateSize +
      overhead;

    const lamports = await connection.getMinimumBalanceForRentExemption(marketSize);

    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: keypair.publicKey,
      newAccountPubkey: phoenixMarketKeypair.publicKey,
      lamports,
      space: marketSize,
      programId: PHOENIX_PROGRAM_ID,
    });

    const logAuthority = getLogAuthority();
    const [baseVault] = derivePhoenixVault(phoenixMarketKeypair.publicKey, yesMint);
    const [quoteVault] = derivePhoenixVault(phoenixMarketKeypair.publicKey, usdcMint);

    // Serialize Phoenix InitializeMarket params
    const initParamsData = Buffer.alloc(256);
    let offset = 0;
    initParamsData.writeBigUInt64LE(bidsSize, offset); offset += 8;
    initParamsData.writeBigUInt64LE(asksSize, offset); offset += 8;
    initParamsData.writeBigUInt64LE(numSeats, offset); offset += 8;
    initParamsData.writeBigUInt64LE(1_000_000n, offset); offset += 8; // numQuoteLotsPerQuoteUnit
    initParamsData.writeBigUInt64LE(1_000_000n, offset); offset += 8; // tickSize
    initParamsData.writeBigUInt64LE(1_000_000n, offset); offset += 8; // numBaseLotsPerBaseUnit
    initParamsData.writeUInt16LE(0, offset); offset += 2; // takerFeeBps
    keypair.publicKey.toBuffer().copy(initParamsData, offset); offset += 32; // feeCollector
    initParamsData.writeUInt8(1, offset); offset += 1; // Some(rawBaseUnitsPerBaseUnit)
    initParamsData.writeUInt32LE(1, offset); offset += 4;

    const ixData = Buffer.alloc(1 + offset);
    ixData.writeUInt8(100, 0);
    initParamsData.copy(ixData, 1, 0, offset);

    const initIx = new TransactionInstruction({
      programId: PHOENIX_PROGRAM_ID,
      keys: [
        { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: logAuthority, isWritable: false, isSigner: false },
        { pubkey: phoenixMarketKeypair.publicKey, isWritable: true, isSigner: true },
        { pubkey: keypair.publicKey, isWritable: true, isSigner: true },
        { pubkey: yesMint, isWritable: false, isSigner: false },
        { pubkey: usdcMint, isWritable: false, isSigner: false },
        { pubkey: baseVault, isWritable: true, isSigner: false },
        { pubkey: quoteVault, isWritable: true, isSigner: false },
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
        { pubkey: anchor.utils.token.TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      ],
      data: ixData,
    });

    const phoenixTx = new Transaction().add(createAccountIx, initIx);
    const phoenixSig = await connection.sendTransaction(phoenixTx, [keypair, phoenixMarketKeypair]);
    await connection.confirmTransaction(phoenixSig, "confirmed");

    // Step 4: Request + approve seat for test wallet
    const seat = getSeatAddress(phoenixMarketKeypair.publicKey, keypair.publicKey);
    const requestSeatIx = createRequestSeatInstruction({
      phoenixProgram: PHOENIX_PROGRAM_ID,
      logAuthority,
      market: phoenixMarketKeypair.publicKey,
      payer: keypair.publicKey,
      seat,
    });

    const seatTx = new Transaction().add(requestSeatIx);
    const seatSig = await connection.sendTransaction(seatTx, [keypair]);
    await connection.confirmTransaction(seatSig, "confirmed");

    // Approve seat (payer is market authority since they created the Phoenix market)
    const approveData = Buffer.alloc(2);
    approveData.writeUInt8(104, 0); // ChangeSeatStatus
    approveData.writeUInt8(1, 1);   // Approved

    const approveIx = new TransactionInstruction({
      programId: PHOENIX_PROGRAM_ID,
      keys: [
        { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: logAuthority, isWritable: false, isSigner: false },
        { pubkey: phoenixMarketKeypair.publicKey, isWritable: true, isSigner: false },
        { pubkey: keypair.publicKey, isWritable: false, isSigner: true },
        { pubkey: seat, isWritable: true, isSigner: false },
      ],
      data: approveData,
    });

    const approveTx = new Transaction().add(approveIx);
    const approveSig = await connection.sendTransaction(approveTx, [keypair]);
    await connection.confirmTransaction(approveSig, "confirmed");

    await use({
      marketPda,
      yesMint,
      noMint,
      vaultPda,
      phoenixMarket: phoenixMarketKeypair.publicKey,
      configPda,
    });
  },
});
