import { PublicKey } from "@solana/web3.js";

const MERIDIAN_PROGRAM_ID = new PublicKey(
  "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

const CONFIG_SEED = Buffer.from("config");
const MARKET_SEED = Buffer.from("market");
const VAULT_SEED = Buffer.from("vault");
const YES_MINT_SEED = Buffer.from("yes_mint");
const NO_MINT_SEED = Buffer.from("no_mint");

export function deriveConfigPda(
  programId: PublicKey = MERIDIAN_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
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
    [MARKET_SEED, Buffer.from([ticker]), tradingDayBuf, strikePriceBuf],
    programId,
  );
}

export function deriveVaultPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, marketPda.toBuffer()],
    programId,
  );
}

export function deriveYesMintPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [YES_MINT_SEED, marketPda.toBuffer()],
    programId,
  );
}

export function deriveNoMintPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [NO_MINT_SEED, marketPda.toBuffer()],
    programId,
  );
}

/** Ticker name → u8 index used in PDA seeds */
export const TICKER_INDEX: Record<string, number> = {
  AAPL: 0,
  MSFT: 1,
  GOOGL: 2,
  AMZN: 3,
  NVDA: 4,
  META: 5,
  TSLA: 6,
};
