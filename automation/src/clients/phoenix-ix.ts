import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getLogAuthority,
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
} from "@ellipsis-labs/phoenix-sdk";

/**
 * Build a Phoenix ChangeSeatStatus instruction (discriminant 104).
 * Status 1 = Approved. Only the market authority can call this.
 */
export function buildApproveSeatIx(
  phoenixMarket: PublicKey,
  marketAuthority: PublicKey,
  seat: PublicKey,
): TransactionInstruction {
  const logAuthority = getLogAuthority();
  const ixData = Buffer.alloc(2);
  ixData.writeUInt8(104, 0); // ChangeSeatStatus discriminant
  ixData.writeUInt8(1, 1); // Approved

  return new TransactionInstruction({
    programId: PHOENIX_PROGRAM_ID,
    keys: [
      { pubkey: PHOENIX_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: logAuthority, isWritable: false, isSigner: false },
      { pubkey: phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: marketAuthority, isWritable: false, isSigner: true },
      { pubkey: seat, isWritable: true, isSigner: false },
    ],
    data: ixData,
  });
}

export interface PlaceLimitOrderParams {
  phoenixMarket: PublicKey;
  trader: PublicKey;
  seat: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseAccount: PublicKey;
  quoteAccount: PublicKey;
  side: "bid" | "ask";
  priceInTicks: bigint;
  numBaseLots: bigint;
}

/**
 * Build a raw Phoenix PlaceLimitOrder instruction (PostOnly).
 * Discriminant = 2 (PlaceLimitOrder).
 */
export function buildPlaceLimitOrderIx(
  params: PlaceLimitOrderParams,
): TransactionInstruction {
  const logAuthority = getLogAuthority();
  const packetBuf = Buffer.alloc(128);
  let offset = 0;

  packetBuf.writeUInt8(0, offset); offset += 1; // PostOnly tag
  packetBuf.writeUInt8(params.side === "bid" ? 0 : 1, offset); offset += 1;
  packetBuf.writeBigUInt64LE(params.priceInTicks, offset); offset += 8;
  packetBuf.writeBigUInt64LE(params.numBaseLots, offset); offset += 8;
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
      { pubkey: params.phoenixMarket, isWritable: true, isSigner: false },
      { pubkey: params.trader, isWritable: false, isSigner: true },
      { pubkey: params.seat, isWritable: false, isSigner: false },
      { pubkey: params.baseAccount, isWritable: true, isSigner: false },
      { pubkey: params.quoteAccount, isWritable: true, isSigner: false },
      { pubkey: params.baseVault, isWritable: true, isSigner: false },
      { pubkey: params.quoteVault, isWritable: true, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ],
    data: ixData,
  });
}
