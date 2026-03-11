import type { ProcessEnv } from "../config/runtime.js";
import { createBootstrapRuntime } from "../config/runtime.js";
import { buildBootstrapSummary } from "../domain/markets.js";
import { logSummaryTable } from "./logging.js";

export async function runBootstrapCheckWorkflow(source: ProcessEnv) {
  const runtime = createBootstrapRuntime(source);
  const version = await runtime.connection.getVersion();
  const summary = buildBootstrapSummary(runtime, version["solana-core"]);

  logSummaryTable(summary);
}
