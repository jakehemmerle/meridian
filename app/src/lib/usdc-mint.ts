import { PublicKey } from "@solana/web3.js";
import { readPublicMeridianEnv } from "./env/public";

let cached: PublicKey | null = null;

/** Resolve the USDC mint, preferring E2E override if present. Cached after first call. */
export function getUsdcMint(): PublicKey {
  if (cached) return cached;
  if (typeof window !== "undefined") {
    const e2eMint = (window as unknown as Record<string, string>).__E2E_USDC_MINT;
    if (e2eMint) {
      cached = new PublicKey(e2eMint);
      return cached;
    }
  }
  const env = readPublicMeridianEnv();
  cached = new PublicKey(env.usdcMint);
  return cached;
}
