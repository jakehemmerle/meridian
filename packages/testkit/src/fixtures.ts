import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function withFixturePaths(env: NodeJS.ProcessEnv) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meridian-bootstrap-"));
  const fixturesDir = path.join(fixtureRoot, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(path.join(fixturesDir, "anchor-wallet.json"), "[]");
  fs.writeFileSync(path.join(fixturesDir, "program-keypair.json"), "[]");

  return {
    cwd: fixtureRoot,
    env,
  };
}
