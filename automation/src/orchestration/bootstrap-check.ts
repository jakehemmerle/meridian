import { PublicKey } from "@solana/web3.js";
import type { ProcessEnv } from "../config/runtime.js";
import { createBootstrapRuntime } from "../config/runtime.js";
import { buildBootstrapSummary } from "../domain/markets.js";
import { logSummaryTable } from "./logging.js";
import {
  validatePhoenixMarket,
  type PhoenixMarketValidation,
} from "../clients/phoenix.js";

export interface PhoenixValidationResult {
  phoenixMarket: string;
  validation: PhoenixMarketValidation;
}

/**
 * Validate a list of Phoenix markets match their expected Meridian configuration.
 */
export async function validatePhoenixMarkets(
  source: ProcessEnv,
  markets: Array<{
    phoenixMarket: PublicKey;
    expectedBaseMint: PublicKey;
    expectedQuoteMint: PublicKey;
  }>,
): Promise<PhoenixValidationResult[]> {
  const runtime = createBootstrapRuntime(source);
  const results: PhoenixValidationResult[] = [];

  for (const market of markets) {
    const validation = await validatePhoenixMarket(
      runtime.connection,
      market.phoenixMarket,
      market.expectedBaseMint,
      market.expectedQuoteMint,
    );
    results.push({
      phoenixMarket: market.phoenixMarket.toBase58(),
      validation,
    });
  }

  return results;
}

export async function runBootstrapCheckWorkflow(source: ProcessEnv) {
  const runtime = createBootstrapRuntime(source);
  const version = await runtime.connection.getVersion();
  const summary = buildBootstrapSummary(runtime, version["solana-core"]);

  logSummaryTable(summary);
}
