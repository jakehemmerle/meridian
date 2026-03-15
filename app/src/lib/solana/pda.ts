import { PublicKey } from "@solana/web3.js";

const enc = new TextEncoder();

export function deriveConfigPda(
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode("config")], programId);
}

export function deriveMarketPda(
  programId: PublicKey,
  ticker: number,
  tradingDay: number,
  strikePrice: bigint,
): [PublicKey, number] {
  const tradingDayBuf = new Uint8Array(4);
  new DataView(tradingDayBuf.buffer).setUint32(0, tradingDay, true);
  const strikePriceBuf = new Uint8Array(8);
  new DataView(strikePriceBuf.buffer).setBigUint64(0, strikePrice, true);

  return PublicKey.findProgramAddressSync(
    [enc.encode("market"), new Uint8Array([ticker]), tradingDayBuf, strikePriceBuf],
    programId,
  );
}

export function deriveVaultPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("vault"), marketPda.toBytes()],
    programId,
  );
}

export function deriveYesMintPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("yes_mint"), marketPda.toBytes()],
    programId,
  );
}

export function deriveNoMintPda(
  programId: PublicKey,
  marketPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("no_mint"), marketPda.toBytes()],
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

// Phoenix PDA derivations — avoids depending on @ellipsis-labs/phoenix-sdk

export function derivePhoenixVault(
  phoenixProgramId: PublicKey,
  phoenixMarket: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("vault"), phoenixMarket.toBytes(), mint.toBytes()],
    phoenixProgramId,
  );
}

export function derivePhoenixLogAuthority(
  phoenixProgramId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("log")],
    phoenixProgramId,
  );
}

export function derivePhoenixSeat(
  phoenixProgramId: PublicKey,
  phoenixMarket: PublicKey,
  trader: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("seat"), phoenixMarket.toBytes(), trader.toBytes()],
    phoenixProgramId,
  );
}

/** Ticker name -> u8 index used in PDA seeds */
export const TICKER_INDEX: Record<string, number> = {
  AAPL: 0,
  MSFT: 1,
  GOOGL: 2,
  AMZN: 3,
  NVDA: 4,
  META: 5,
  TSLA: 6,
};
