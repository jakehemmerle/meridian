import assert from "node:assert/strict";
import test from "node:test";

import { VALID_BOOTSTRAP_ENV, withFixturePaths } from "@meridian/testkit";

import { validateBootstrapEnv } from "../../../automation/src/config/env.js";

test("bootstrap validation rejects missing env", () => {
  const fixture = withFixturePaths({
    ...VALID_BOOTSTRAP_ENV,
  });

  const missingEnv = { ...fixture.env };
  delete missingEnv.MERIDIAN_PROGRAM_ID;

  assert.throws(() => validateBootstrapEnv(missingEnv, { cwd: fixture.cwd }));
});

test("bootstrap validation rejects non-devnet cluster", () => {
  const fixture = withFixturePaths({
    ...VALID_BOOTSTRAP_ENV,
    NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-beta",
  });

  assert.throws(
    () => validateBootstrapEnv(fixture.env, { cwd: fixture.cwd }),
    /NEXT_PUBLIC_SOLANA_CLUSTER must be "devnet"/,
  );
});

test("bootstrap validation rejects a missing Phoenix seat manager program id", () => {
  const fixture = withFixturePaths({
    ...VALID_BOOTSTRAP_ENV,
  });

  const missingEnv = { ...fixture.env };
  delete missingEnv.MERIDIAN_PHOENIX_SEAT_MANAGER_PROGRAM_ID;

  assert.throws(() => validateBootstrapEnv(missingEnv, { cwd: fixture.cwd }));
});

test("bootstrap validation rejects nonzero Phoenix taker fees", () => {
  const fixture = withFixturePaths({
    ...VALID_BOOTSTRAP_ENV,
    MERIDIAN_PHOENIX_TAKER_FEE_BPS: "5",
  });

  assert.throws(
    () => validateBootstrapEnv(fixture.env, { cwd: fixture.cwd }),
    /MERIDIAN_PHOENIX_TAKER_FEE_BPS must remain 0/,
  );
});

test("bootstrap validation rejects unknown Phoenix market authority modes", () => {
  const fixture = withFixturePaths({
    ...VALID_BOOTSTRAP_ENV,
    MERIDIAN_PHOENIX_MARKET_AUTHORITY_MODE: "custom-authority",
  });

  assert.throws(() => validateBootstrapEnv(fixture.env, { cwd: fixture.cwd }));
});

test("bootstrap validation accepts a complete devnet configuration", () => {
  const fixture = withFixturePaths({
    ...VALID_BOOTSTRAP_ENV,
  });

  const result = validateBootstrapEnv(fixture.env, { cwd: fixture.cwd });

  assert.equal(result.env.NEXT_PUBLIC_SOLANA_CLUSTER, "devnet");
  assert.match(result.resolvedPaths.anchorWalletPath, /anchor-wallet\.json$/);
  assert.match(result.resolvedPaths.programKeypairPath, /program-keypair\.json$/);
  assert.equal(result.publicKeys.programId, VALID_BOOTSTRAP_ENV.MERIDIAN_PROGRAM_ID);
  assert.equal(
    result.publicKeys.phoenixSeatManagerProgramId,
    VALID_BOOTSTRAP_ENV.MERIDIAN_PHOENIX_SEAT_MANAGER_PROGRAM_ID,
  );
  assert.equal(result.env.MERIDIAN_PHOENIX_TAKER_FEE_BPS, 0);
  assert.equal(result.env.MERIDIAN_PHOENIX_MARKET_AUTHORITY_MODE, "seat-manager");
});
