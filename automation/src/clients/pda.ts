import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID as PHOENIX_PROGRAM_ID } from "@ellipsis-labs/phoenix-sdk";

// ─── Seed Constants ──────────────────────────────────────────────────────────

export const SEEDS = {
  config: Buffer.from("config"),
  market: Buffer.from("market"),
  vault: Buffer.from("vault"),
  yesMint: Buffer.from("yes_mint"),
  noMint: Buffer.from("no_mint"),
} as const;

// ─── Meridian PDA Derivation ─────────────────────────────────────────────────

export function deriveConfigPda(
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.config], programId);
}

export function deriveMarketPda(
  programId: PublicKey,
  ticker: number,
  tradingDay: number,
  strikePrice: bigint,
): [PublicKey, number] {
  const tradingDayBuf = Buffer.alloc(4);
  tradingDayBuf.writeUInt32LE(tradingDay);
  const strikePriceBuf = Buffer.alloc(8);
  strikePriceBuf.writeBigUInt64LE(strikePrice);
  return PublicKey.findProgramAddressSync(
    [SEEDS.market, Buffer.from([ticker]), tradingDayBuf, strikePriceBuf],
    programId,
  );
}

export function deriveVaultPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.vault, marketPda.toBuffer()],
    programId,
  );
}

export function deriveYesMintPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.yesMint, marketPda.toBuffer()],
    programId,
  );
}

export function deriveNoMintPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.noMint, marketPda.toBuffer()],
    programId,
  );
}

export function deriveAllMarketPdas(
  programId: PublicKey,
  marketPda: PublicKey,
): { vault: PublicKey; yesMint: PublicKey; noMint: PublicKey } {
  const [vault] = deriveVaultPda(programId, marketPda);
  const [yesMint] = deriveYesMintPda(programId, marketPda);
  const [noMint] = deriveNoMintPda(programId, marketPda);
  return { vault, yesMint, noMint };
}

// ─── Phoenix PDA Derivation ─────────────────────────────────────────────────

export function derivePhoenixVault(
  phoenixMarket: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), phoenixMarket.toBuffer(), mint.toBuffer()],
    PHOENIX_PROGRAM_ID,
  );
}

// ─── Feed ID Conversion ─────────────────────────────────────────────────────

/** Convert a hex string feed ID (from @meridian/domain) to Uint8Array (for on-chain use). */
export function feedIdToBytes(hexString: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
