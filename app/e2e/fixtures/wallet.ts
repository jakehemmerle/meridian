import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { validatorTest } from "./validator";

export interface WalletFixture {
  keypair: Keypair;
  usdcMint: PublicKey;
  connection: Connection;
}

/**
 * Per-test wallet fixture that:
 * - Generates a fresh Keypair
 * - Airdrops 10 SOL
 * - Creates a USDC mint (6 decimals)
 * - Mints 1000 USDC to the test wallet's ATA
 */
export const walletTest = validatorTest.extend<{ wallet: WalletFixture }>({
  wallet: async ({ validator }, use) => {
    const connection = new Connection(validator.rpcUrl, "confirmed");
    const keypair = Keypair.generate();

    // Airdrop 10 SOL
    const sig = await connection.requestAirdrop(
      keypair.publicKey,
      10 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    // Create USDC mock mint (6 decimals) with test wallet as mint authority
    const usdcMint = await createMint(
      connection,
      keypair,
      keypair.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
    );

    // Create ATA and mint 1000 USDC
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      usdcMint,
      keypair.publicKey,
    );

    await mintTo(
      connection,
      keypair,
      usdcMint,
      ata.address,
      keypair.publicKey,
      1000 * 1_000_000, // 1000 USDC in 6-decimal
    );

    await use({ keypair, usdcMint, connection });
  },
});
