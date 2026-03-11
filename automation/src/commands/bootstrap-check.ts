import type { ProcessEnv } from "../config/runtime.js";
import { runBootstrapCheckWorkflow } from "../orchestration/bootstrap-check.js";

export async function runBootstrapCheck(source: ProcessEnv) {
  await runBootstrapCheckWorkflow(source);
}
