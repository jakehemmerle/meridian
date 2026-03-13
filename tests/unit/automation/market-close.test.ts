import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";

import {
  PHOENIX_MARKET_STATUS,
  buildChangeMarketStatusIx,
} from "../../../automation/src/clients/phoenix.js";
import {
  runMarketCloseJob,
  type MarketCloseJobDeps,
} from "../../../automation/src/jobs/close-markets.js";

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

// --- runMarketCloseJob tests ---

function makeMockCloseDeps(
  overrides: Partial<MarketCloseJobDeps> = {},
): MarketCloseJobDeps {
  return {
    activeMarkets: [
      { ticker: "AAPL", strikePrice: 230, meridianMarket: "aapl-meridian-pda", phoenixMarket: "aapl-phoenix-pda" },
      { ticker: "META", strikePrice: 680, meridianMarket: "meta-meridian-pda", phoenixMarket: "meta-phoenix-pda" },
    ],
    closePhoenixMarket: async () => ({ txSignature: "phoenix-close-sig" }),
    closeMeridianMarket: async () => ({ txSignature: "meridian-close-sig" }),
    ...overrides,
  };
}

test("happy path: closes all active markets successfully", async () => {
  const phoenixCalls: string[] = [];
  const meridianCalls: string[] = [];

  const deps = makeMockCloseDeps({
    closePhoenixMarket: async (phoenixMarket) => {
      phoenixCalls.push(phoenixMarket);
      return { txSignature: `phoenix-sig-${phoenixMarket}` };
    },
    closeMeridianMarket: async (meridianMarket) => {
      meridianCalls.push(meridianMarket);
      return { txSignature: `meridian-sig-${meridianMarket}` };
    },
  });

  const result = await runMarketCloseJob(deps);

  assert.equal(result.status, "success");
  assert.equal(result.job, "close-markets");
  assert.equal(result.closures.length, 2);

  for (const c of result.closures) {
    assert.equal(c.status, "success");
    assert.ok(c.phoenixTxSignature);
    assert.ok(c.meridianTxSignature);
  }

  // Phoenix should be closed before Meridian (order matters)
  assert.equal(phoenixCalls.length, 2);
  assert.equal(meridianCalls.length, 2);
});
