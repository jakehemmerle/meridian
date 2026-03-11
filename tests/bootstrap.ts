import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateBootstrapEnv } from "../automation/src/config.js";

const VALID_ENV = {
  SOLANA_RPC_URL: "https://api.devnet.solana.com",
  ANCHOR_WALLET: "fixtures/anchor-wallet.json",
  MERIDIAN_PROGRAM_ID: "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
  MERIDIAN_PROGRAM_KEYPAIR: "fixtures/program-keypair.json",
  MERIDIAN_USDC_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  MERIDIAN_PHOENIX_PROGRAM_ID: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
  MERIDIAN_PYTH_RECEIVER_PROGRAM_ID: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
  MERIDIAN_PYTH_PRICE_PROGRAM_ID: "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT",
  NEXT_PUBLIC_SOLANA_CLUSTER: "devnet",
  NEXT_PUBLIC_SOLANA_RPC_URL: "https://api.devnet.solana.com",
  NEXT_PUBLIC_MERIDIAN_PROGRAM_ID: "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
  NEXT_PUBLIC_MERIDIAN_USDC_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
  NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
} as const;

function withFixturePaths(env: NodeJS.ProcessEnv) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meridian-bootstrap-"));
  const fixturesDir = path.join(fixtureRoot, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(path.join(fixturesDir, "anchor-wallet.json"), "[]");
  fs.writeFileSync(path.join(fixturesDir, "program-keypair.json"), "[]");

  return {
    cwd: fixtureRoot,
    cleanup: () => undefined,
    env,
  };
}

test("bootstrap validation rejects missing env", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
  });

  try {
    const missingEnv = { ...fixture.env };
    delete missingEnv.MERIDIAN_PROGRAM_ID;

    assert.throws(() => validateBootstrapEnv(missingEnv, { cwd: fixture.cwd }));
  } finally {
    fixture.cleanup();
  }
});

test("bootstrap validation rejects non-devnet cluster", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
    NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-beta",
  });

  try {
    assert.throws(
      () => validateBootstrapEnv(fixture.env, { cwd: fixture.cwd }),
      /NEXT_PUBLIC_SOLANA_CLUSTER must be "devnet"/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("bootstrap validation accepts a complete devnet configuration", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
  });

  try {
    const result = validateBootstrapEnv(fixture.env, { cwd: fixture.cwd });

    assert.equal(result.env.NEXT_PUBLIC_SOLANA_CLUSTER, "devnet");
    assert.match(result.resolvedPaths.anchorWalletPath, /anchor-wallet\.json$/);
    assert.match(result.resolvedPaths.programKeypairPath, /program-keypair\.json$/);
    assert.equal(result.publicKeys.programId, VALID_ENV.MERIDIAN_PROGRAM_ID);
  } finally {
    fixture.cleanup();
  }
});
