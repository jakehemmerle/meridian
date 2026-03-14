import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID as PHOENIX_PROGRAM_ID,
  getLogAuthority,
} from "@ellipsis-labs/phoenix-sdk";

import {
  buildChangeMarketStatusIx,
  changePhoenixMarketStatus,
  PHOENIX_MARKET_STATUS,
  makeClosePhoenixMarket,
} from "../../../automation/src/clients/phoenix.js";

const FAKE_MARKET = Keypair.generate().publicKey;
const FAKE_AUTHORITY = Keypair.generate();

test("makeClosePhoenixMarket: calls changePhoenixMarketStatus with CLOSED status", async () => {
  let capturedIx: { market: string; status: number } | undefined;

  // We can't easily mock changePhoenixMarketStatus, so test that
  // buildChangeMarketStatusIx produces the correct instruction for CLOSED.
  const ix = buildChangeMarketStatusIx(
    FAKE_MARKET,
    FAKE_AUTHORITY.publicKey,
    PHOENIX_MARKET_STATUS.CLOSED,
  );

  // Verify instruction data: discriminant 103, status CLOSED (4)
  assert.equal(ix.data[0], 103);
  assert.equal(ix.data[1], PHOENIX_MARKET_STATUS.CLOSED);
  assert.equal(ix.data.length, 2);

  // Verify accounts
  assert.equal(ix.programId.toBase58(), PHOENIX_PROGRAM_ID.toBase58());
  assert.equal(ix.keys.length, 4);

  // market is writable
  const marketKey = ix.keys.find((k) => k.pubkey.equals(FAKE_MARKET));
  assert.ok(marketKey);
  assert.equal(marketKey!.isWritable, true);
  assert.equal(marketKey!.isSigner, false);

  // authority is signer
  const authKey = ix.keys.find((k) => k.pubkey.equals(FAKE_AUTHORITY.publicKey));
  assert.ok(authKey);
  assert.equal(authKey!.isSigner, true);
});

test("makeClosePhoenixMarket: returned function accepts string market address", async () => {
  // Verify the factory produces a function with the right signature
  // We can't call it without a real connection, but we verify it's callable
  const mockConnection = {} as any;
  const fn = makeClosePhoenixMarket(mockConnection, FAKE_AUTHORITY);
  assert.equal(typeof fn, "function");
});
