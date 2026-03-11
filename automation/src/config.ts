import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
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
  NEXT_PUBLIC_SOLANA_CLUSTER: z.string().min(1),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url(),
  NEXT_PUBLIC_MERIDIAN_PROGRAM_ID: z.string().min(1),
  NEXT_PUBLIC_MERIDIAN_USDC_MINT: z.string().min(1),
  NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID: z.string().min(1),
  NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID: z.string().min(1),
});

export type MeridianEnv = z.infer<typeof envSchema>;

function assertPublicKey(name: keyof MeridianEnv, value: string) {
  try {
    return new PublicKey(value).toBase58();
  } catch (error) {
    throw new Error(
      `${String(name)} must be a valid Solana public key: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function assertPathExists(name: keyof MeridianEnv, value: string, cwd: string) {
  const normalizedValue = value.startsWith("~")
    ? path.join(process.env.HOME ?? "", value.slice(1))
    : value;
  const resolvedPath = path.resolve(cwd, normalizedValue);

  if (!existsSync(resolvedPath)) {
    throw new Error(`${String(name)} points to a missing file: ${resolvedPath}`);
  }

  return resolvedPath;
}

export function validateBootstrapEnv(
  source: NodeJS.ProcessEnv,
  options: { cwd?: string } = {},
) {
  const cwd = options.cwd ?? process.cwd();
  const parsed = envSchema.parse(source);

  if (parsed.NEXT_PUBLIC_SOLANA_CLUSTER !== "devnet") {
    throw new Error(
      `NEXT_PUBLIC_SOLANA_CLUSTER must be "devnet" for Meridian bootstrap, received "${parsed.NEXT_PUBLIC_SOLANA_CLUSTER}"`,
    );
  }

  if (parsed.SOLANA_RPC_URL !== parsed.NEXT_PUBLIC_SOLANA_RPC_URL) {
    throw new Error("SOLANA_RPC_URL and NEXT_PUBLIC_SOLANA_RPC_URL must match");
  }

  const sharedProgramId = assertPublicKey("MERIDIAN_PROGRAM_ID", parsed.MERIDIAN_PROGRAM_ID);
  const sharedUsdcMint = assertPublicKey("MERIDIAN_USDC_MINT", parsed.MERIDIAN_USDC_MINT);
  const sharedPhoenixProgramId = assertPublicKey(
    "MERIDIAN_PHOENIX_PROGRAM_ID",
    parsed.MERIDIAN_PHOENIX_PROGRAM_ID,
  );
  const sharedPythReceiverProgramId = assertPublicKey(
    "MERIDIAN_PYTH_RECEIVER_PROGRAM_ID",
    parsed.MERIDIAN_PYTH_RECEIVER_PROGRAM_ID,
  );

  if (
    sharedProgramId !==
    assertPublicKey("NEXT_PUBLIC_MERIDIAN_PROGRAM_ID", parsed.NEXT_PUBLIC_MERIDIAN_PROGRAM_ID)
  ) {
    throw new Error("MERIDIAN_PROGRAM_ID and NEXT_PUBLIC_MERIDIAN_PROGRAM_ID must match");
  }

  if (
    sharedUsdcMint !==
    assertPublicKey("NEXT_PUBLIC_MERIDIAN_USDC_MINT", parsed.NEXT_PUBLIC_MERIDIAN_USDC_MINT)
  ) {
    throw new Error("MERIDIAN_USDC_MINT and NEXT_PUBLIC_MERIDIAN_USDC_MINT must match");
  }

  if (
    sharedPhoenixProgramId !==
    assertPublicKey(
      "NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID",
      parsed.NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID,
    )
  ) {
    throw new Error(
      "MERIDIAN_PHOENIX_PROGRAM_ID and NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID must match",
    );
  }

  if (
    sharedPythReceiverProgramId !==
    assertPublicKey(
      "NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID",
      parsed.NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID,
    )
  ) {
    throw new Error(
      "MERIDIAN_PYTH_RECEIVER_PROGRAM_ID and NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID must match",
    );
  }

  const anchorWalletPath = assertPathExists("ANCHOR_WALLET", parsed.ANCHOR_WALLET, cwd);
  const programKeypairPath = assertPathExists(
    "MERIDIAN_PROGRAM_KEYPAIR",
    parsed.MERIDIAN_PROGRAM_KEYPAIR,
    cwd,
  );

  return {
    env: parsed,
    resolvedPaths: {
      anchorWalletPath,
      programKeypairPath,
    },
    publicKeys: {
      programId: sharedProgramId,
      usdcMint: sharedUsdcMint,
      phoenixProgramId: sharedPhoenixProgramId,
      pythReceiverProgramId: sharedPythReceiverProgramId,
      pythPriceProgramId: assertPublicKey(
        "MERIDIAN_PYTH_PRICE_PROGRAM_ID",
        parsed.MERIDIAN_PYTH_PRICE_PROGRAM_ID,
      ),
    },
  };
}

export function loadBootstrapEnv(source: NodeJS.ProcessEnv = process.env) {
  return validateBootstrapEnv(source).env;
}
