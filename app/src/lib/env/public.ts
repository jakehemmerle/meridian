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

export function readPublicMeridianEnv(source: NodeJS.ProcessEnv = process.env): PublicMeridianEnv {
  return {
    cluster: source.NEXT_PUBLIC_SOLANA_CLUSTER ?? DEFAULT_PUBLIC_SOLANA_CLUSTER,
    rpcUrl: source.NEXT_PUBLIC_SOLANA_RPC_URL ?? null,
    programId: source.NEXT_PUBLIC_MERIDIAN_PROGRAM_ID ?? MERIDIAN_PROGRAM_ID,
    usdcMint: source.NEXT_PUBLIC_MERIDIAN_USDC_MINT ?? DEVNET_USDC_MINT,
    phoenixProgramId:
      source.NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID ?? MERIDIAN_PHOENIX_PROGRAM_ID,
    pythReceiverProgramId:
      source.NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID ??
      MERIDIAN_PYTH_RECEIVER_PROGRAM_ID,
  };
}
