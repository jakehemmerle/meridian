import assert from "node:assert/strict";
import test from "node:test";

import * as anchor from "@coral-xyz/anchor";

test("keeps the scaffolded program id stable", () => {
  const programId = new anchor.web3.PublicKey(
    process.env.MERIDIAN_PROGRAM_ID ?? "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
  );

  assert.equal(programId.toBase58(), "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y");
});
