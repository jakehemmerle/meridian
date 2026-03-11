import { Connection } from "@solana/web3.js";

export type SolanaConnection = Connection;

export function buildSolanaConnection(rpcUrl: string): SolanaConnection {
  return new Connection(rpcUrl, "confirmed");
}
