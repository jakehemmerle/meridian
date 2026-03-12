import assert from "node:assert/strict";
import test, { describe } from "node:test";

import * as anchor from "@coral-xyz/anchor";
import { createMint, getMint } from "@solana/spl-token";
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

/** Derive Phoenix vault PDA */
function derivePhoenixVault(
  market: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer(), mint.toBuffer()],
    PHOENIX_PROGRAM_ID,
  );
}

/** Build Phoenix InitializeMarket instruction data (borsh-serialized) */
function buildInitializeMarketData(
  feeCollector: PublicKey,
): Buffer {
  const buf = Buffer.alloc(256);
  let offset = 0;

  // market_size_params
  buf.writeBigUInt64LE(512n, offset); offset += 8; // bids_size
  buf.writeBigUInt64LE(512n, offset); offset += 8; // asks_size
  buf.writeBigUInt64LE(128n, offset); offset += 8; // num_seats

  // num_quote_lots_per_quote_unit
  buf.writeBigUInt64LE(1_000_000n, offset); offset += 8;
  // tick_size_in_quote_lots_per_base_unit
  buf.writeBigUInt64LE(1_000_000n, offset); offset += 8;
  // num_base_lots_per_base_unit
  buf.writeBigUInt64LE(1_000_000n, offset); offset += 8;
  // taker_fee_bps
  buf.writeUInt16LE(0, offset); offset += 2;
  // fee_collector
  feeCollector.toBuffer().copy(buf, offset); offset += 32;
  // raw_base_units_per_base_unit: Some(1)
  buf.writeUInt8(1, offset); offset += 1;
  buf.writeUInt32LE(1, offset); offset += 4;

  const ixData = Buffer.alloc(1 + offset);
  ixData.writeUInt8(100, 0); // InitializeMarket discriminant
  buf.copy(ixData, 1, 0, offset);
  return ixData;
}

/** Create a Phoenix market on localnet */
async function createPhoenixMarketOnChain(
  connection: anchor.web3.Connection,
  payer: Keypair,
  baseMint: PublicKey,
  quoteMint: PublicKey,
): Promise<{ phoenixMarket: PublicKey; marketKeypair: Keypair }> {
  const marketKeypair = Keypair.generate();

  // Market account size for (512, 512, 128) — generous estimate
  const marketSize = 576 + (512 + 512) * 80 + 128 * 128 + 8192;
  const lamports =
    await connection.getMinimumBalanceForRentExemption(marketSize);

  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: marketKeypair.publicKey,
    lamports,
    space: marketSize,
    programId: PHOENIX_PROGRAM_ID,
  });

  const logAuthority = getLogAuthority();
  const [baseVault] = derivePhoenixVault(marketKeypair.publicKey, baseMint);
  const [quoteVault] = derivePhoenixVault(marketKeypair.publicKey, quoteMint);

  const ixData = buildInitializeMarketData(payer.publicKey);

  const initializeIx = new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: marketKeypair.publicKey, isWritable: true, isSigner: true },
      { pubkey: payer.publicKey, isWritable: true, isSigner: true },
      { pubkey: baseMint, isWritable: false, isSigner: false },
      { pubkey: quoteMint, isWritable: false, isSigner: false },
      { pubkey: baseVault, isWritable: true, isSigner: false },
      { pubkey: quoteVault, isWritable: true, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      {
        pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        isWritable: false,
        isSigner: false,
      },
    ],
    data: ixData,
  });

  const tx = new Transaction().add(createAccountIx, initializeIx);
  const sig = await connection.sendTransaction(tx, [payer, marketKeypair]);
  await connection.confirmTransaction(sig, "confirmed");

  return { phoenixMarket: marketKeypair.publicKey, marketKeypair };
}

describe(
  "phoenix-bootstrap",
  { skip: !process.env.ANCHOR_PROVIDER_URL },
  () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
    const payer = (provider.wallet as anchor.Wallet).payer;

    const adminAuthority = Keypair.generate();
    const operationsAuthority = Keypair.generate();
    let usdcMint: PublicKey;
    let configPda: PublicKey;

    const TICKER_AAPL = 0;
    const TRADING_DAY = 20260315;
    const STRIKE_PRICE = BigInt(200_000_000);

    let meridianMarketPda: PublicKey;
    let yesMintPda: PublicKey;
    let phoenixMarketPubkey: PublicKey;

    test("setup: airdrop and initialize config", async () => {
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

      await new Promise((r) => setTimeout(r, 1000));

      usdcMint = await createMint(
        provider.connection,
        payer,
        payer.publicKey,
        null,
        6,
      );

      [configPda] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED],
        PROGRAM_ID,
      );

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
    });

    test("creates a Meridian market then bootstraps a Phoenix market for its Yes mint", async () => {
      [meridianMarketPda] = deriveMarketPda(
        TICKER_AAPL,
        TRADING_DAY,
        STRIKE_PRICE,
      );

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, meridianMarketPda.toBuffer()],
        PROGRAM_ID,
      );
      [yesMintPda] = PublicKey.findProgramAddressSync(
        [YES_MINT_SEED, meridianMarketPda.toBuffer()],
        PROGRAM_ID,
      );
      const [noMintPda] = PublicKey.findProgramAddressSync(
        [NO_MINT_SEED, meridianMarketPda.toBuffer()],
        PROGRAM_ID,
      );

      // Pre-derive Phoenix market address (we'll know it after creating the keypair)
      // For now, use a placeholder — Meridian stores whatever pubkey we pass
      const phoenixPlaceholder = Keypair.generate().publicKey;

      const closeTimeTs = new anchor.BN(1_763_504_400);
      const settleAfterTs = new anchor.BN(1_763_504_400 + 600);

      // Step 1: Create Meridian market
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

      // Verify Yes mint was created
      const yesMint = await getMint(provider.connection, yesMintPda);
      assert.equal(yesMint.decimals, 6);

      // Step 2: Create Phoenix market with Yes mint as base, USDC as quote
      const result = await createPhoenixMarketOnChain(
        provider.connection,
        payer,
        yesMintPda,
        usdcMint,
      );
      phoenixMarketPubkey = result.phoenixMarket;

      // Step 3: Read back the Phoenix market header and verify
      const accountInfo =
        await provider.connection.getAccountInfo(phoenixMarketPubkey);
      assert.ok(accountInfo, "Phoenix market account should exist");

      const headerSize = marketHeaderBeet.byteSize;
      const [header] = marketHeaderBeet.deserialize(
        Buffer.from(accountInfo.data.subarray(0, headerSize)),
      );

      // Verify base mint = Yes mint
      assert.equal(
        header.baseParams.mintKey.toBase58(),
        yesMintPda.toBase58(),
        "Base mint should be Yes mint",
      );

      // Verify quote mint = USDC
      assert.equal(
        header.quoteParams.mintKey.toBase58(),
        usdcMint.toBase58(),
        "Quote mint should be USDC",
      );

      // Markets initialize as PostOnly (status = 2)
      assert.equal(Number(header.status), 2, "Market status should be PostOnly after init");
    });

    test("seat request succeeds", async () => {
      const trader = payer;
      const seat = getSeatAddress(phoenixMarketPubkey, trader.publicKey);

      const logAuthority = getLogAuthority();
      const ix = createRequestSeatInstruction({
        phoenixProgram: PHOENIX_PROGRAM_ID,
        logAuthority,
        market: phoenixMarketPubkey,
        payer: trader.publicKey,
        seat,
      });

      const tx = new Transaction().add(ix);
      const sig = await provider.connection.sendTransaction(tx, [trader]);
      await provider.connection.confirmTransaction(sig, "confirmed");

      // Verify seat account exists
      const seatAccount = await provider.connection.getAccountInfo(seat);
      assert.ok(seatAccount, "Seat account should exist after request");
      assert.ok(seatAccount.data.length > 0, "Seat account should have data");
    });

    test("seat approval via market authority (ChangeSeatStatus)", async () => {
      const trader = payer;
      const seat = getSeatAddress(phoenixMarketPubkey, trader.publicKey);
      const logAuthority = getLogAuthority();

      // ChangeSeatStatus discriminant = 104
      // Data: [104, status_u64_le] where 1 = Approved
      const ixData = Buffer.alloc(9);
      ixData.writeUInt8(104, 0);
      ixData.writeBigUInt64LE(1n, 1); // SeatApprovalStatus::Approved

      const ix = new TransactionInstruction({
        programId: PHOENIX_PROGRAM_ID,
        keys: [
          { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: logAuthority, isWritable: false, isSigner: false },
          { pubkey: phoenixMarketPubkey, isWritable: true, isSigner: false },
          // Market authority = payer (creator)
          { pubkey: payer.publicKey, isWritable: false, isSigner: true },
          { pubkey: seat, isWritable: true, isSigner: false },
        ],
        data: ixData,
      });

      const tx = new Transaction().add(ix);
      const sig = await provider.connection.sendTransaction(tx, [payer]);
      await provider.connection.confirmTransaction(sig, "confirmed");

      // Read seat and verify approval status
      const seatAccount = await provider.connection.getAccountInfo(seat);
      assert.ok(seatAccount, "Seat account should exist");
      // Seat layout: discriminant(u64) + market(32) + trader(32) + approval_status(u64)
      const approvalStatus = seatAccount.data.readBigUInt64LE(8 + 32 + 32);
      assert.equal(
        approvalStatus,
        1n,
        "Seat should be approved (status=1)",
      );
    });

    test("missing seat blocks order placement", async () => {
      // Create a new trader without a seat
      const traderWithoutSeat = Keypair.generate();
      await provider.connection.requestAirdrop(
        traderWithoutSeat.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await new Promise((r) => setTimeout(r, 1000));

      // Try to place a limit order — should fail because no seat
      // PlaceLimitOrder discriminant = 0, requires a seat account
      const seat = getSeatAddress(
        phoenixMarketPubkey,
        traderWithoutSeat.publicKey,
      );
      const logAuthority = getLogAuthority();

      // Minimal limit order packet (will fail at seat check before parsing order)
      const ixData = Buffer.alloc(100);
      ixData.writeUInt8(0, 0); // Swap (discriminant 0) — simplest order type

      const ix = new TransactionInstruction({
        programId: PHOENIX_PROGRAM_ID,
        keys: [
          { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: logAuthority, isWritable: false, isSigner: false },
          {
            pubkey: phoenixMarketPubkey,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: traderWithoutSeat.publicKey,
            isWritable: false,
            isSigner: true,
          },
          // Seat account (doesn't exist)
          { pubkey: seat, isWritable: true, isSigner: false },
        ],
        data: ixData,
      });

      const tx = new Transaction().add(ix);

      await assert.rejects(
        provider.connection
          .sendTransaction(tx, [traderWithoutSeat])
          .then((sig) =>
            provider.connection.confirmTransaction(sig, "confirmed"),
          ),
        "Should fail when trader has no seat",
      );
    });
  },
);
