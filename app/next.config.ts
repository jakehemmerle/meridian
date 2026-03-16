import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  env: {
    NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_MERIDIAN_PROGRAM_ID: process.env.NEXT_PUBLIC_MERIDIAN_PROGRAM_ID,
    NEXT_PUBLIC_MERIDIAN_USDC_MINT: process.env.NEXT_PUBLIC_MERIDIAN_USDC_MINT,
    NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID: process.env.NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID,
    NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID: process.env.NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID,
  },
};

export default nextConfig;

