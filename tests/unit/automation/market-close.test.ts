import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";

import {
  PHOENIX_MARKET_STATUS,
  buildChangeMarketStatusIx,
} from "../../../automation/src/clients/phoenix.js";

const FAKE_MARKET = Keypair.generate().publicKey;
const FAKE_AUTHORITY = Keypair.generate().publicKey;

test("PHOENIX_MARKET_STATUS includes CLOSED, PAUSED, TOMBSTONED", () => {
  assert.equal(PHOENIX_MARKET_STATUS.CLOSED, 4);
  assert.equal(PHOENIX_MARKET_STATUS.PAUSED, 3);
  assert.equal(PHOENIX_MARKET_STATUS.TOMBSTONED, 5);
});

test("buildChangeMarketStatusIx: instruction data is [103, status]", () => {
  const ix = buildChangeMarketStatusIx(FAKE_MARKET, FAKE_AUTHORITY, PHOENIX_MARKET_STATUS.CLOSED);
  assert.equal(ix.data[0], 103);
  assert.equal(ix.data[1], 4);
  assert.equal(ix.data.length, 2);
});

test("buildChangeMarketStatusIx: account keys are phoenix program, log authority, market (writable), authority (signer)", () => {
  const ix = buildChangeMarketStatusIx(FAKE_MARKET, FAKE_AUTHORITY, PHOENIX_MARKET_STATUS.CLOSED);

  // Should have 4 accounts
  assert.equal(ix.keys.length, 4);

  // market should be writable
  const marketKey = ix.keys.find((k) => k.pubkey.equals(FAKE_MARKET));
  assert.ok(marketKey, "market key should be present");
  assert.equal(marketKey!.isWritable, true);

  // authority should be signer
  const authorityKey = ix.keys.find((k) => k.pubkey.equals(FAKE_AUTHORITY));
  assert.ok(authorityKey, "authority key should be present");
  assert.equal(authorityKey!.isSigner, true);
});
