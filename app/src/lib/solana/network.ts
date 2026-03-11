import { readPublicMeridianEnv } from "../env/public";

export interface SolanaNetworkConfig {
  cluster: string;
  rpcUrl: string | null;
  programId: string;
}

export function getSolanaNetworkConfig(): SolanaNetworkConfig {
  const env = readPublicMeridianEnv();

  return {
    cluster: env.cluster,
    rpcUrl: env.rpcUrl,
    programId: env.programId,
  };
}
