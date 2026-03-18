/**
 * CLI dispatcher — invokes automation jobs as standalone commands.
 *
 * Usage: node dist/cli.js <command>
 * Commands: morning, afternoon, close, settle, bootstrap
 */

import { runMorningJob } from "./jobs/morning-job.js";
import { runAfternoonJob } from "./jobs/afternoon-job.js";
import { runMarketCloseJob } from "./jobs/close-markets.js";
import { runSettleMarketsJob } from "./jobs/settle-markets.js";
import { runBootstrapCheck } from "./commands/bootstrap-check.js";
import {
  buildMorningDeps,
  buildAfternoonDeps,
  buildCloseDeps,
  buildSettleDeps,
} from "./cli-deps.js";
import { validateBootstrapEnv } from "./config/env.js";

const COMMANDS = ["morning", "afternoon", "close", "settle", "bootstrap"] as const;
type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log(`Meridian Automation CLI

Usage: node dist/cli.js <command>

Commands:
  morning     Create markets for the trading day (8:00 AM ET weekdays)
  afternoon   Close and settle all markets (4:05 PM ET weekdays)
  close       Close all active markets (Phoenix + Meridian)
  settle      Settle all closed markets (fetch oracle price + on-chain settle)
  bootstrap   Validate environment configuration`);
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | "--help" | "-h" | undefined;

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (!COMMANDS.includes(command as Command)) {
    console.error(`Unknown command: ${command}\n`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === "bootstrap") {
    await runBootstrapCheck(process.env);
    return;
  }

  const bootstrap = validateBootstrapEnv(process.env);

  let result: unknown;

  switch (command) {
    case "morning": {
      const deps = await buildMorningDeps(bootstrap);
      result = await runMorningJob(deps);
      break;
    }
    case "afternoon": {
      const deps = await buildAfternoonDeps(bootstrap);
      result = await runAfternoonJob(deps);
      break;
    }
    case "close": {
      const deps = await buildCloseDeps(bootstrap);
      result = await runMarketCloseJob(deps);
      break;
    }
    case "settle": {
      const deps = await buildSettleDeps(bootstrap);
      result = await runSettleMarketsJob(deps);
      break;
    }
  }

  // JSON output for Cloud Run log ingestion
  console.log(JSON.stringify(result, null, 2));

  if (
    result &&
    typeof result === "object" &&
    "status" in result &&
    result.status === "error"
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({ error: error.message, stack: error.stack }),
  );
  process.exitCode = 1;
});
