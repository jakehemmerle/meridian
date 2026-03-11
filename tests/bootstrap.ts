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
  MERIDIAN_PHOENIX_SEAT_MANAGER_PROGRAM_ID: "PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1",
  MERIDIAN_PHOENIX_TAKER_FEE_BPS: "0",
  MERIDIAN_PHOENIX_MARKET_AUTHORITY_MODE: "seat-manager",
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
    env,
  };
}

test("bootstrap validation rejects missing env", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
  });

  const missingEnv = { ...fixture.env };
  delete missingEnv.MERIDIAN_PROGRAM_ID;

  assert.throws(() => validateBootstrapEnv(missingEnv, { cwd: fixture.cwd }));
});

test("bootstrap validation rejects non-devnet cluster", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
    NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-beta",
  });

  assert.throws(
    () => validateBootstrapEnv(fixture.env, { cwd: fixture.cwd }),
    /NEXT_PUBLIC_SOLANA_CLUSTER must be "devnet"/,
  );
});

test("bootstrap validation rejects a missing Phoenix seat manager program id", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
  });

  const missingEnv = { ...fixture.env };
  delete missingEnv.MERIDIAN_PHOENIX_SEAT_MANAGER_PROGRAM_ID;

  assert.throws(() => validateBootstrapEnv(missingEnv, { cwd: fixture.cwd }));
});

test("bootstrap validation rejects nonzero Phoenix taker fees", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
    MERIDIAN_PHOENIX_TAKER_FEE_BPS: "5",
  });

  assert.throws(
    () => validateBootstrapEnv(fixture.env, { cwd: fixture.cwd }),
    /MERIDIAN_PHOENIX_TAKER_FEE_BPS must remain 0/,
  );
});

test("bootstrap validation rejects unknown Phoenix market authority modes", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
    MERIDIAN_PHOENIX_MARKET_AUTHORITY_MODE: "custom-authority",
  });

  assert.throws(() => validateBootstrapEnv(fixture.env, { cwd: fixture.cwd }));
});

test("bootstrap validation accepts a complete devnet configuration", () => {
  const fixture = withFixturePaths({
    ...VALID_ENV,
  });

  const result = validateBootstrapEnv(fixture.env, { cwd: fixture.cwd });

  assert.equal(result.env.NEXT_PUBLIC_SOLANA_CLUSTER, "devnet");
  assert.match(result.resolvedPaths.anchorWalletPath, /anchor-wallet\.json$/);
  assert.match(result.resolvedPaths.programKeypairPath, /program-keypair\.json$/);
  assert.equal(result.publicKeys.programId, VALID_ENV.MERIDIAN_PROGRAM_ID);
  assert.equal(
    result.publicKeys.phoenixSeatManagerProgramId,
    VALID_ENV.MERIDIAN_PHOENIX_SEAT_MANAGER_PROGRAM_ID,
  );
  assert.equal(result.env.MERIDIAN_PHOENIX_TAKER_FEE_BPS, 0);
  assert.equal(result.env.MERIDIAN_PHOENIX_MARKET_AUTHORITY_MODE, "seat-manager");
});
