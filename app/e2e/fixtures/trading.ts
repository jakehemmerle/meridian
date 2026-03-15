import {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getLogAuthority,
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
  getSeatAddress,
  createRequestSeatInstruction,
} from "@ellipsis-labs/phoenix-sdk";
import * as anchor from "@coral-xyz/anchor";

import { marketTest, type MarketFixture } from "./market";

const MERIDIAN_PROGRAM_ID = new PublicKey(
  "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

const CONFIG_SEED = Buffer.from("config");
const VAULT_SEED = Buffer.from("vault");
const YES_MINT_SEED = Buffer.from("yes_mint");
const NO_MINT_SEED = Buffer.from("no_mint");

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

/**
 * Build a Phoenix PlaceLimitOrder (PostOnly) instruction.
 * Discriminant = 2.
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
  packetBuf.writeUInt8(0, offset); offset += 1; // PostOnly tag
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
  ixData.writeUInt8(2, 0); // PlaceLimitOrder discriminant
  packetBuf.copy(ixData, 1, 0, offset);

  return new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: trader, isWritable: false, isSigner: true },
      { pubkey: seat, isWritable: false, isSigner: false },
      { pubkey: baseAccount, isWritable: true, isSigner: false },
      { pubkey: quoteAccount, isWritable: true, isSigner: false },
      { pubkey: baseVault, isWritable: true, isSigner: false },
      { pubkey: quoteVault, isWritable: true, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ],
    data: ixData,
  });
}

export interface TradingFixture extends MarketFixture {
  userYesAta: PublicKey;
  userNoAta: PublicKey;
  userUsdcAta: PublicKey;
  phoenixBaseVault: PublicKey;
  phoenixQuoteVault: PublicKey;
}

/**
 * Trading fixture that extends marketTest with:
 * - User has 10 minted Yes/No pairs
 * - Market maker places resting ask (5 Yes at 60 ticks) and bid (5 Yes at 40 ticks)
 * - RPC URL is injected into the browser for the app to use
 */
export const tradingTest = marketTest.extend<{ trading: TradingFixture }>({
  trading: async ({ wallet, market, validator, page }, use) => {
    const { connection, keypair, usdcMint } = wallet;
    const { marketPda, yesMint, noMint, vaultPda, phoenixMarket, configPda } = market;

    // Set up Anchor provider
    const anchorWallet = new anchor.Wallet(keypair);
    const anchorConnection = new anchor.web3.Connection(validator.rpcUrl, "confirmed");
    const provider = new anchor.AnchorProvider(anchorConnection, anchorWallet, {
      commitment: "confirmed",
    });

    const idl = await anchor.Program.fetchIdl(MERIDIAN_PROGRAM_ID, provider);
    if (!idl) throw new Error("Could not fetch Meridian IDL");
    const program = new anchor.Program(idl, provider);

    // Create ATAs for test wallet
    const userUsdcAta = (
      await getOrCreateAssociatedTokenAccount(connection, keypair, usdcMint, keypair.publicKey)
    ).address;
    const userYesAta = (
      await getOrCreateAssociatedTokenAccount(connection, keypair, yesMint, keypair.publicKey)
    ).address;
    const userNoAta = (
      await getOrCreateAssociatedTokenAccount(connection, keypair, noMint, keypair.publicKey)
    ).address;

    // Mint 10 Yes/No pairs for the test wallet
    await program.methods
      .mintPair(new anchor.BN(10))
      .accounts({
        user: keypair.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint,
        noMint,
        userUsdc: userUsdcAta,
        userYes: userYesAta,
        userNo: userNoAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([keypair])
      .rpc();

    // Create a market maker with funded accounts and resting orders
    const marketMaker = Keypair.generate();
    const mmAirdrop = await connection.requestAirdrop(
      marketMaker.publicKey,
      5_000_000_000,
    );
    await connection.confirmTransaction(mmAirdrop, "confirmed");

    const mmUsdcAta = (
      await getOrCreateAssociatedTokenAccount(connection, keypair, usdcMint, marketMaker.publicKey)
    ).address;
    const mmYesAta = (
      await getOrCreateAssociatedTokenAccount(connection, keypair, yesMint, marketMaker.publicKey)
    ).address;
    const mmNoAta = (
      await getOrCreateAssociatedTokenAccount(connection, keypair, noMint, marketMaker.publicKey)
    ).address;

    // Fund market maker with USDC
    await mintTo(connection, keypair, usdcMint, mmUsdcAta, keypair.publicKey, 500_000_000);

    // Mint pairs for market maker
    await program.methods
      .mintPair(new anchor.BN(50))
      .accounts({
        user: marketMaker.publicKey,
        config: configPda,
        market: marketPda,
        vault: vaultPda,
        yesMint,
        noMint,
        userUsdc: mmUsdcAta,
        userYes: mmYesAta,
        userNo: mmNoAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([marketMaker])
      .rpc();

    // Request + approve seat for market maker
    const mmSeat = getSeatAddress(phoenixMarket, marketMaker.publicKey);
    const requestSeatIx = createRequestSeatInstruction({
      phoenixProgram: PHOENIX_PROGRAM_ID,
      logAuthority: getLogAuthority(),
      market: phoenixMarket,
      payer: marketMaker.publicKey,
      seat: mmSeat,
    });

    const seatTx = new Transaction().add(requestSeatIx);
    const seatSig = await connection.sendTransaction(seatTx, [marketMaker]);
    await connection.confirmTransaction(seatSig, "confirmed");

    // Approve seat (keypair is the market authority since they created the Phoenix market)
    const approveData = Buffer.alloc(2);
    approveData.writeUInt8(104, 0); // ChangeSeatStatus
    approveData.writeUInt8(1, 1); // Approved
    const approveIx = new TransactionInstruction({
      programId: PHOENIX_PROGRAM_ID,
      keys: [
        { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: getLogAuthority(), isWritable: false, isSigner: false },
        { pubkey: phoenixMarket, isWritable: true, isSigner: false },
        { pubkey: keypair.publicKey, isWritable: false, isSigner: true },
        { pubkey: mmSeat, isWritable: true, isSigner: false },
      ],
      data: approveData,
    });
    const approveTx = new Transaction().add(approveIx);
    const approveSig = await connection.sendTransaction(approveTx, [keypair]);
    await connection.confirmTransaction(approveSig, "confirmed");

    // Activate Phoenix market (change from PostOnly to Active)
    const activateData = Buffer.alloc(2);
    activateData.writeUInt8(103, 0); // ChangeMarketStatus
    activateData.writeUInt8(1, 1); // Active
    const activateIx = new TransactionInstruction({
      programId: PHOENIX_PROGRAM_ID,
      keys: [
        { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: getLogAuthority(), isWritable: false, isSigner: false },
        { pubkey: phoenixMarket, isWritable: true, isSigner: false },
        { pubkey: keypair.publicKey, isWritable: false, isSigner: true },
      ],
      data: activateData,
    });
    const activateTx = new Transaction().add(activateIx);
    const activateSig = await connection.sendTransaction(activateTx, [keypair]);
    await connection.confirmTransaction(activateSig, "confirmed");

    // Derive Phoenix vaults
    const [phoenixBaseVault] = derivePhoenixVault(phoenixMarket, yesMint);
    const [phoenixQuoteVault] = derivePhoenixVault(phoenixMarket, usdcMint);

    // Market maker places resting ask (5 Yes at 60 ticks ≈ $0.60) and bid (5 Yes at 40 ticks ≈ $0.40)
    const ONE_USDC = 1_000_000;
    const askIx = buildPlaceLimitOrderIx(
      phoenixMarket,
      marketMaker.publicKey,
      mmSeat,
      phoenixBaseVault,
      phoenixQuoteVault,
      mmYesAta,
      mmUsdcAta,
      "ask",
      60n,
      5n * BigInt(ONE_USDC),
    );

    const bidIx = buildPlaceLimitOrderIx(
      phoenixMarket,
      marketMaker.publicKey,
      mmSeat,
      phoenixBaseVault,
      phoenixQuoteVault,
      mmYesAta,
      mmUsdcAta,
      "bid",
      40n,
      5n * BigInt(ONE_USDC),
    );

    const orderTx = new Transaction().add(askIx, bidIx);
    const orderSig = await connection.sendTransaction(orderTx, [marketMaker]);
    await connection.confirmTransaction(orderSig, "confirmed");

    // Inject RPC URL and USDC mint into browser so the app connects to our test validator
    await page.addInitScript(
      ({ rpcUrl, usdcMintStr }) => {
        (window as Record<string, unknown>).__E2E_RPC_URL = rpcUrl;
        (window as Record<string, unknown>).__E2E_USDC_MINT = usdcMintStr;
      },
      { rpcUrl: validator.rpcUrl, usdcMintStr: usdcMint.toBase58() },
    );

    await use({
      ...market,
      userYesAta,
      userNoAta,
      userUsdcAta,
      phoenixBaseVault,
      phoenixQuoteVault,
    });
  },
});
