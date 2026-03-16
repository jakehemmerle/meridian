import {
  DEFAULT_PUBLIC_SOLANA_CLUSTER,
  DEVNET_USDC_MINT,
  MERIDIAN_PHOENIX_PROGRAM_ID,
  MERIDIAN_PROGRAM_ID,
  MERIDIAN_PYTH_RECEIVER_PROGRAM_ID,
} from "@meridian/domain";

export interface PublicMeridianEnv {
  cluster: string;
  rpcUrl: string | null;
  programId: string;
  usdcMint: string;
  phoenixProgramId: string;
  pythReceiverProgramId: string;
}

// Next.js only inlines NEXT_PUBLIC_* vars when accessed as static
// `process.env.NEXT_PUBLIC_X` references. Dynamic access (e.g. via a
// passed-in `source` object) is invisible to webpack's DefinePlugin and
// always resolves to `undefined` on the client.
export function readPublicMeridianEnv(): PublicMeridianEnv {
  return {
    cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? DEFAULT_PUBLIC_SOLANA_CLUSTER,
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? null,
    programId: process.env.NEXT_PUBLIC_MERIDIAN_PROGRAM_ID ?? MERIDIAN_PROGRAM_ID,
    usdcMint: process.env.NEXT_PUBLIC_MERIDIAN_USDC_MINT ?? DEVNET_USDC_MINT,
    phoenixProgramId:
      process.env.NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID ?? MERIDIAN_PHOENIX_PROGRAM_ID,
    pythReceiverProgramId:
      process.env.NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID ??
      MERIDIAN_PYTH_RECEIVER_PROGRAM_ID,
  };
}
