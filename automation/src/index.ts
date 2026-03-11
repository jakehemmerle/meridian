import { Connection, PublicKey } from "@solana/web3.js";

import { validateBootstrapEnv } from "./config.js";

async function main() {
  const bootstrap = validateBootstrapEnv(process.env);
  const env = bootstrap.env;
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const version = await connection.getVersion();

  const summary = {
    rpcUrl: env.SOLANA_RPC_URL,
    cluster: env.NEXT_PUBLIC_SOLANA_CLUSTER,
    programId: new PublicKey(env.MERIDIAN_PROGRAM_ID).toBase58(),
    usdcMint: new PublicKey(env.MERIDIAN_USDC_MINT).toBase58(),
    phoenixProgramId: new PublicKey(env.MERIDIAN_PHOENIX_PROGRAM_ID).toBase58(),
    pythReceiverProgramId: new PublicKey(env.MERIDIAN_PYTH_RECEIVER_PROGRAM_ID).toBase58(),
    anchorWalletPath: bootstrap.resolvedPaths.anchorWalletPath,
    programKeypairPath: bootstrap.resolvedPaths.programKeypairPath,
    solanaCore: version["solana-core"],
  };

  console.table(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
