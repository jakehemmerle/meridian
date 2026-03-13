import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getLogAuthority,
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
  getSeatAddress,
  createRequestSeatInstruction,
  getClaimSeatIx,
  marketHeaderBeet,
  type MarketHeader,
} from "@ellipsis-labs/phoenix-sdk";

/** Phoenix market status values */
export const PHOENIX_MARKET_STATUS = {
  ACTIVE: 1,
  POST_ONLY: 2,
  PAUSED: 3,
  CLOSED: 4,
  TOMBSTONED: 5,
} as const;

/** Derive Phoenix vault PDA: seeds = ["vault", market, mint] */
function deriveVaultAddress(
  market: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer(), mint.toBuffer()],
    PHOENIX_PROGRAM_ID,
  );
}

export interface CreatePhoenixMarketParams {
  baseMint: PublicKey;
  quoteMint: PublicKey;
  numBaseLotsPerBaseUnit: bigint;
  tickSizeInQuoteLotsPerBaseUnit: bigint;
  numQuoteLotsPerQuoteUnit: bigint;
  takerFeeBps: number;
  rawBaseUnitsPerBaseUnit: number;
  numSeats?: bigint;
  bidsSize?: bigint;
  asksSize?: bigint;
}

/** Default Meridian market params: 6-decimal Yes token vs 6-decimal USDC */
export const MERIDIAN_PHOENIX_DEFAULTS: Omit<
  CreatePhoenixMarketParams,
  "baseMint" | "quoteMint"
> = {
  numBaseLotsPerBaseUnit: 1_000_000n,
  tickSizeInQuoteLotsPerBaseUnit: 1_000_000n,
  numQuoteLotsPerQuoteUnit: 1_000_000n,
  takerFeeBps: 0,
  rawBaseUnitsPerBaseUnit: 1,
  numSeats: 128n,
  bidsSize: 512n,
  asksSize: 512n,
};

/**
 * Compute the required account size for a Phoenix market.
 * Uses a generous estimate based on phoenix-v1 dispatch_market.rs.
 */
function getMarketAccountSize(
  bidsSize: bigint,
  asksSize: bigint,
  numSeats: bigint,
): number {
  // MarketHeader = 576 bytes
  // Each FIFO order slot ~ 80 bytes, each trader state ~ 128 bytes, plus overhead
  const headerSize = 576;
  const orderSlotSize = 80;
  const traderStateSize = 128;
  const overhead = 8192;
  return (
    headerSize +
    Number(bidsSize + asksSize) * orderSlotSize +
    Number(numSeats) * traderStateSize +
    overhead
  );
}

/**
 * Creates a Phoenix market on-chain.
 * The market account is a new Keypair — the creator (payer) becomes the market authority.
 */
export async function createPhoenixMarket(
  connection: Connection,
  payer: Keypair,
  params: CreatePhoenixMarketParams,
): Promise<{ phoenixMarket: PublicKey; marketKeypair: Keypair }> {
  const marketKeypair = Keypair.generate();
  const bidsSize = params.bidsSize ?? 512n;
  const asksSize = params.asksSize ?? 512n;
  const numSeats = params.numSeats ?? 128n;

  const marketSize = getMarketAccountSize(bidsSize, asksSize, numSeats);
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
  const [baseVault] = deriveVaultAddress(
    marketKeypair.publicKey,
    params.baseMint,
  );
  const [quoteVault] = deriveVaultAddress(
    marketKeypair.publicKey,
    params.quoteMint,
  );

  // Serialize InitializeParams using borsh layout matching Phoenix's on-chain format
  const initParamsData = Buffer.alloc(256);
  let offset = 0;

  // market_size_params: { bids_size: u64, asks_size: u64, num_seats: u64 }
  initParamsData.writeBigUInt64LE(bidsSize, offset);
  offset += 8;
  initParamsData.writeBigUInt64LE(asksSize, offset);
  offset += 8;
  initParamsData.writeBigUInt64LE(numSeats, offset);
  offset += 8;

  // num_quote_lots_per_quote_unit: u64
  initParamsData.writeBigUInt64LE(params.numQuoteLotsPerQuoteUnit, offset);
  offset += 8;

  // tick_size_in_quote_lots_per_base_unit: u64
  initParamsData.writeBigUInt64LE(
    params.tickSizeInQuoteLotsPerBaseUnit,
    offset,
  );
  offset += 8;

  // num_base_lots_per_base_unit: u64
  initParamsData.writeBigUInt64LE(params.numBaseLotsPerBaseUnit, offset);
  offset += 8;

  // taker_fee_bps: u16
  initParamsData.writeUInt16LE(params.takerFeeBps, offset);
  offset += 2;

  // fee_collector: Pubkey (32 bytes)
  payer.publicKey.toBuffer().copy(initParamsData, offset);
  offset += 32;

  // raw_base_units_per_base_unit: Option<u32> — borsh Option: 1 byte tag + value
  initParamsData.writeUInt8(1, offset); // Some
  offset += 1;
  initParamsData.writeUInt32LE(params.rawBaseUnitsPerBaseUnit, offset);
  offset += 4;

  // Instruction data: [discriminant (u8=100), ...params]
  const ixData = Buffer.alloc(1 + offset);
  ixData.writeUInt8(100, 0); // InitializeMarket discriminant
  initParamsData.copy(ixData, 1, 0, offset);

  const initializeIx = new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: marketKeypair.publicKey, isWritable: true, isSigner: true },
      { pubkey: payer.publicKey, isWritable: true, isSigner: true },
      { pubkey: params.baseMint, isWritable: false, isSigner: false },
      { pubkey: params.quoteMint, isWritable: false, isSigner: false },
      { pubkey: baseVault, isWritable: true, isSigner: false },
      { pubkey: quoteVault, isWritable: true, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ],
    data: ixData,
  });

  const tx = new Transaction().add(createAccountIx, initializeIx);
  const sig = await connection.sendTransaction(tx, [payer, marketKeypair]);
  await connection.confirmTransaction(sig, "confirmed");

  return { phoenixMarket: marketKeypair.publicKey, marketKeypair };
}

/**
 * Request a seat on a Phoenix market (via Phoenix program directly).
 */
export async function requestSeat(
  connection: Connection,
  payer: Keypair,
  phoenixMarket: PublicKey,
  trader: PublicKey,
): Promise<PublicKey> {
  const seat = getSeatAddress(phoenixMarket, trader);
  const logAuthority = getLogAuthority();

  const ix = createRequestSeatInstruction({
    phoenixProgram: PHOENIX_PROGRAM_ID,
    logAuthority,
    market: phoenixMarket,
    payer: payer.publicKey,
    seat,
  });

  const tx = new Transaction().add(ix);
  const sig = await connection.sendTransaction(tx, [payer]);
  await connection.confirmTransaction(sig, "confirmed");

  return seat;
}

/**
 * Claim a seat on a Phoenix market via the Seat Manager program.
 */
export async function claimSeat(
  connection: Connection,
  payer: Keypair,
  phoenixMarket: PublicKey,
  trader: PublicKey,
): Promise<PublicKey> {
  const ix = getClaimSeatIx(phoenixMarket, trader);
  const tx = new Transaction().add(ix);
  const sig = await connection.sendTransaction(tx, [payer]);
  await connection.confirmTransaction(sig, "confirmed");
  return getSeatAddress(phoenixMarket, trader);
}

/**
 * Read and deserialize the Phoenix market header from on-chain data.
 */
export async function getMarketHeader(
  connection: Connection,
  phoenixMarket: PublicKey,
): Promise<MarketHeader> {
  const accountInfo = await connection.getAccountInfo(phoenixMarket);
  if (!accountInfo) {
    throw new Error(
      `Phoenix market account not found: ${phoenixMarket.toBase58()}`,
    );
  }

  const headerSize = marketHeaderBeet.byteSize;
  const headerBuf = accountInfo.data.subarray(0, headerSize);
  const [header] = marketHeaderBeet.deserialize(Buffer.from(headerBuf));
  return header;
}

/**
 * Build a ChangeMarketStatus instruction for a Phoenix market.
 * Discriminant 103, status byte at offset 1.
 */
export function buildChangeMarketStatusIx(
  phoenixMarket: PublicKey,
  authority: PublicKey,
  status: number,
): TransactionInstruction {
  const data = Buffer.alloc(2);
  data.writeUInt8(103, 0); // ChangeMarketStatus discriminant
  data.writeUInt8(status, 1);

  const logAuthority = getLogAuthority();

  return new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: authority, isWritable: false, isSigner: true },
    ],
    data,
  });
}

/**
 * Send a ChangeMarketStatus transaction.
 */
export async function changePhoenixMarketStatus(
  connection: Connection,
  authority: Keypair,
  phoenixMarket: PublicKey,
  status: number,
): Promise<string> {
  const ix = buildChangeMarketStatusIx(phoenixMarket, authority.publicKey, status);
  const tx = new Transaction().add(ix);
  const sig = await connection.sendTransaction(tx, [authority]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export interface PhoenixMarketValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a Phoenix market matches expected Meridian configuration.
 */
export async function validatePhoenixMarket(
  connection: Connection,
  phoenixMarket: PublicKey,
  expectedBaseMint: PublicKey,
  expectedQuoteMint: PublicKey,
): Promise<PhoenixMarketValidation> {
  const errors: string[] = [];

  const header = await getMarketHeader(connection, phoenixMarket);

  if (!header.baseParams.mintKey.equals(expectedBaseMint)) {
    errors.push(
      `Base mint mismatch: expected ${expectedBaseMint.toBase58()}, got ${header.baseParams.mintKey.toBase58()}`,
    );
  }

  if (!header.quoteParams.mintKey.equals(expectedQuoteMint)) {
    errors.push(
      `Quote mint mismatch: expected ${expectedQuoteMint.toBase58()}, got ${header.quoteParams.mintKey.toBase58()}`,
    );
  }

  const status = Number(header.status);
  if (
    status !== PHOENIX_MARKET_STATUS.ACTIVE &&
    status !== PHOENIX_MARKET_STATUS.POST_ONLY
  ) {
    errors.push(
      `Unexpected market status: ${status} (expected Active=${PHOENIX_MARKET_STATUS.ACTIVE} or PostOnly=${PHOENIX_MARKET_STATUS.POST_ONLY})`,
    );
  }

  return { valid: errors.length === 0, errors };
}
