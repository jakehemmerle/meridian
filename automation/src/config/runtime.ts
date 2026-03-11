import {
  buildSolanaConnection,
  type SolanaConnection,
} from "../clients/solana.js";
import {
  type BootstrapEnvValidation,
  validateBootstrapEnv,
  type MeridianEnv,
} from "./env.js";

export interface BootstrapRuntime {
  bootstrap: BootstrapEnvValidation;
  connection: SolanaConnection;
  env: MeridianEnv;
}

export type ProcessEnv = NodeJS.ProcessEnv;

export function createBootstrapRuntime(source: ProcessEnv): BootstrapRuntime {
  const bootstrap = validateBootstrapEnv(source);

  return {
    bootstrap,
    connection: buildSolanaConnection(bootstrap.env.SOLANA_RPC_URL),
    env: bootstrap.env,
  };
}
