import { runBootstrapCheck } from "./commands/bootstrap-check.js";

async function main() {
  await runBootstrapCheck(process.env);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
