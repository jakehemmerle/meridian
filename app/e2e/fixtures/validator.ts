import { test as base } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as net from "node:net";

const PROJECT_DIR = path.resolve(__dirname, "../../..");
const MERIDIAN_SO = path.join(PROJECT_DIR, "target/deploy/meridian.so");
const MERIDIAN_PROGRAM_ID = "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y";
const PHOENIX_PROGRAM = "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY";
const PHOENIX_PSM = "PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1";
const DEVNET_URL = "https://api.devnet.solana.com";

/** Find an available port in the ephemeral range. */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not get port")));
      }
    });
    server.on("error", reject);
  });
}

/** Allocate a contiguous block of 30 ports starting from a free base. */
async function allocatePortBlock(): Promise<number> {
  // Find a free port, then use it as the base for a 30-port block
  const base = await findFreePort();
  // Round up to avoid collision — use base + 100 buffer from ephemeral
  return base + 100;
}

async function waitForValidator(rpcUrl: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      execSync(`solana cluster-version -u "${rpcUrl}"`, {
        stdio: "pipe",
        timeout: 5000,
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Validator at ${rpcUrl} not ready after ${maxRetries}s`);
}

export interface ValidatorFixture {
  rpcUrl: string;
  rpcPort: number;
}

/**
 * Playwright fixture that starts a solana-test-validator per worker.
 * Loads Meridian program + clones Phoenix and Seat Manager from devnet.
 */
export const validatorTest = base.extend<object, { validator: ValidatorFixture }>({
  validator: [
    async ({}, use) => {
      const basePort = await allocatePortBlock();
      const rpcPort = basePort;
      const faucetPort = basePort + 2;
      const gossipPort = basePort + 3;
      const dynStart = basePort + 4;
      const dynEnd = basePort + 29;
      const ledgerDir = `/tmp/e2e-test-ledger-${rpcPort}`;
      const rpcUrl = `http://127.0.0.1:${rpcPort}`;

      const args = [
        "--reset",
        "--bind-address", "127.0.0.1",
        "--rpc-port", String(rpcPort),
        "--faucet-port", String(faucetPort),
        "--gossip-port", String(gossipPort),
        "--dynamic-port-range", `${dynStart}-${dynEnd}`,
        "--ledger", ledgerDir,
        "--url", DEVNET_URL,
        "--clone-upgradeable-program", PHOENIX_PROGRAM,
        "--clone-upgradeable-program", PHOENIX_PSM,
        "--bpf-program", MERIDIAN_PROGRAM_ID, MERIDIAN_SO,
        "--quiet",
      ];

      const validatorProcess: ChildProcess = spawn("solana-test-validator", args, {
        stdio: "pipe",
        detached: false,
      });

      // Ensure cleanup on unexpected exit
      const cleanup = () => {
        try {
          validatorProcess.kill("SIGTERM");
        } catch {
          // already dead
        }
        try {
          execSync(`rm -rf "${ledgerDir}"`, { stdio: "pipe" });
        } catch {
          // best effort
        }
      };

      try {
        await waitForValidator(rpcUrl);
        console.log(`solana-test-validator ready on port ${rpcPort}`);

        await use({ rpcUrl, rpcPort });
      } finally {
        cleanup();
        // Wait for process to exit
        await new Promise<void>((resolve) => {
          validatorProcess.on("exit", () => resolve());
          setTimeout(resolve, 3000); // fallback timeout
        });
      }
    },
    { scope: "worker" },
  ],
});
