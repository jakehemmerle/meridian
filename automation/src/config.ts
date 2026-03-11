import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: process.env.DOTENV_CONFIG_PATH ?? ".env" });

const envSchema = z.object({
  SOLANA_RPC_URL: z.string().url(),
  ANCHOR_WALLET: z.string().min(1),
  MERIDIAN_PROGRAM_ID: z.string().min(1),
  MERIDIAN_PROGRAM_KEYPAIR: z.string().min(1),
  MERIDIAN_USDC_MINT: z.string().min(1),
  MERIDIAN_PHOENIX_PROGRAM_ID: z.string().min(1),
  MERIDIAN_PYTH_RECEIVER_PROGRAM_ID: z.string().min(1),
  MERIDIAN_PYTH_PRICE_PROGRAM_ID: z.string().min(1),
});

export const env = envSchema.parse(process.env);
