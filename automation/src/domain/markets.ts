import { PublicKey } from "@solana/web3.js";

import type { BootstrapRuntime } from "../config/runtime.js";

const MERIDIAN_ORDER_EXPIRY_RULE = "Phoenix orders must expire at or before market close";

export function buildBootstrapSummary(runtime: BootstrapRuntime, solanaCoreVersion: string) {
  const { bootstrap, env } = runtime;

  return {
    rpcUrl: env.SOLANA_RPC_URL,
    cluster: env.NEXT_PUBLIC_SOLANA_CLUSTER,
    programId: new PublicKey(env.MERIDIAN_PROGRAM_ID).toBase58(),
    usdcMint: new PublicKey(env.MERIDIAN_USDC_MINT).toBase58(),
    phoenixProgramId: new PublicKey(env.MERIDIAN_PHOENIX_PROGRAM_ID).toBase58(),
    phoenixSeatManagerProgramId: new PublicKey(
      env.MERIDIAN_PHOENIX_SEAT_MANAGER_PROGRAM_ID,
    ).toBase58(),
    phoenixTakerFeeBps: env.MERIDIAN_PHOENIX_TAKER_FEE_BPS,
    phoenixMarketAuthorityMode: env.MERIDIAN_PHOENIX_MARKET_AUTHORITY_MODE,
    meridianOrderExpiryRule: MERIDIAN_ORDER_EXPIRY_RULE,
    pythReceiverProgramId: new PublicKey(env.MERIDIAN_PYTH_RECEIVER_PROGRAM_ID).toBase58(),
    anchorWalletPath: bootstrap.resolvedPaths.anchorWalletPath,
    programKeypairPath: bootstrap.resolvedPaths.programKeypairPath,
    solanaCore: solanaCoreVersion,
  };
}
