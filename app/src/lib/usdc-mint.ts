import { PublicKey } from "@solana/web3.js";
import { readPublicMeridianEnv } from "./env/public";

/** Resolve the USDC mint, preferring E2E override if present */
export function getUsdcMint(): PublicKey {
  if (typeof window !== "undefined") {
    const e2eMint = (window as unknown as Record<string, string>).__E2E_USDC_MINT;
    if (e2eMint) return new PublicKey(e2eMint);
  }
  const env = readPublicMeridianEnv();
  return new PublicKey(env.usdcMint);
}
