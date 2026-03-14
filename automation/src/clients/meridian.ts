import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

/** Meridian program ID (must match declare_id! in lib.rs) */
export const MERIDIAN_PROGRAM_ID = new PublicKey(
  "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

const CONFIG_SEED = Buffer.from("config");

/** Anchor discriminator for `close_market` (first 8 bytes of sha256("global:close_market")) */
export const CLOSE_MARKET_DISCRIMINATOR = Buffer.from([
  88, 154, 248, 186, 48, 14, 123, 244,
]);

/** Derive the Meridian config PDA. */
export function deriveConfigPda(
  programId: PublicKey = MERIDIAN_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

/**
 * Build a `close_market` instruction for the Meridian program.
 *
 * Accounts: [operations_authority (signer), config (PDA), market (writable)]
 */
export function buildCloseMarketIx(
  market: PublicKey,
  operationsAuthority: PublicKey,
  programId: PublicKey = MERIDIAN_PROGRAM_ID,
): TransactionInstruction {
  const [configPda] = deriveConfigPda(programId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: operationsAuthority, isWritable: false, isSigner: true },
      { pubkey: configPda, isWritable: false, isSigner: false },
      { pubkey: market, isWritable: true, isSigner: false },
    ],
    data: CLOSE_MARKET_DISCRIMINATOR,
  });
}

/**
 * Send a `close_market` transaction.
 * Returns the transaction signature on success.
 */
export async function closeMeridianMarketOnChain(
  connection: Connection,
  operationsAuthority: Keypair,
  market: PublicKey,
  programId: PublicKey = MERIDIAN_PROGRAM_ID,
): Promise<string> {
  const ix = buildCloseMarketIx(
    market,
    operationsAuthority.publicKey,
    programId,
  );
  const tx = new Transaction().add(ix);
  const sig = await connection.sendTransaction(tx, [operationsAuthority]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

/**
 * Factory: create a `closeMeridianMarket` function matching the
 * `MarketCloseJobDeps` interface signature.
 */
export function makeCloseMeridianMarket(
  connection: Connection,
  operationsAuthority: Keypair,
  programId: PublicKey = MERIDIAN_PROGRAM_ID,
): (meridianMarket: string) => Promise<{ txSignature: string }> {
  return async (meridianMarket: string) => {
    const market = new PublicKey(meridianMarket);
    const txSignature = await closeMeridianMarketOnChain(
      connection,
      operationsAuthority,
      market,
      programId,
    );
    return { txSignature };
  };
}
