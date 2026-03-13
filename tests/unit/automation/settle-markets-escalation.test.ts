import assert from "node:assert/strict";
import test from "node:test";

import { MERIDIAN_TICKER_FEEDS } from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

import {
  makeValidatedFetchSettlementPrice,
} from "../../../automation/src/jobs/settlement-deps.js";
import {
  runSettleMarketsJob,
  type SettleMarketsDeps,
} from "../../../automation/src/jobs/settle-markets.js";

const AAPL_FEED = MERIDIAN_TICKER_FEEDS.AAPL;
const MARKET_CLOSE_UTC = 1_763_504_400;

test("makeValidatedFetchSettlementPrice rejects stale snapshots", async () => {
  const innerFetch = async () =>
    makeHermesSnapshot("AAPL", {
      publish_time: MARKET_CLOSE_UTC - 600, // 10 min before close
    });

  const fetch = makeValidatedFetchSettlementPrice(AAPL_FEED, {
    maximumAgeSeconds: 120, // only 2 min allowed
    confidenceLimitBps: 100,
  }, innerFetch);

  await assert.rejects(
    () => fetch("AAPL", MARKET_CLOSE_UTC),
    (err: Error) => {
      assert.ok(err.message.includes("too old"));
      return true;
    },
  );
});

test("makeValidatedFetchSettlementPrice rejects low-confidence snapshots", async () => {
  const innerFetch = async () =>
    makeHermesSnapshot("AAPL", {
      price: "23000000000",
      conf: "2300000000", // 10% confidence — way over limit
      publish_time: MARKET_CLOSE_UTC - 30,
    });

  const fetch = makeValidatedFetchSettlementPrice(AAPL_FEED, {
    maximumAgeSeconds: 120,
    confidenceLimitBps: 50, // 0.5% limit
  }, innerFetch);

  await assert.rejects(
    () => fetch("AAPL", MARKET_CLOSE_UTC),
    (err: Error) => {
      assert.ok(err.message.includes("confidence"));
      return true;
    },
  );
});

test("makeValidatedFetchSettlementPrice passes valid snapshots through", async () => {
  const innerFetch = async () =>
    makeHermesSnapshot("AAPL", {
      price: "23000000000",
      conf: "1000000",
      publish_time: MARKET_CLOSE_UTC - 30,
    });

  const fetch = makeValidatedFetchSettlementPrice(AAPL_FEED, {
    maximumAgeSeconds: 120,
    confidenceLimitBps: 100,
  }, innerFetch);

  const result = await fetch("AAPL", MARKET_CLOSE_UTC);
  assert.equal(result.id, AAPL_FEED);
  assert.equal(result.price.price, "23000000000");
});

// --- Escalation signal tests ---

function makeMockDeps(overrides: Partial<SettleMarketsDeps> = {}): SettleMarketsDeps {
  return {
    activeMarkets: [
      {
        ticker: "AAPL",
        strikePrice: 230,
        meridianMarket: "aapl-market-pda",
        marketCloseUtc: MARKET_CLOSE_UTC,
      },
      {
        ticker: "META",
        strikePrice: 680,
        meridianMarket: "meta-market-pda",
        marketCloseUtc: MARKET_CLOSE_UTC,
      },
    ],
    fetchSettlementPrice: async (ticker) => {
      return makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
        publish_time: MARKET_CLOSE_UTC - 60,
      });
    },
    settleMarketOnChain: async () => {
      return { settled: true, txSignature: "fake-sig" };
    },
    retryConfig: { maxDurationMs: 100, baseDelayMs: 10 },
    ...overrides,
  };
}

test("all markets fail → escalation with requiresAdminOverride and failed markets", async () => {
  const deps = makeMockDeps({
    fetchSettlementPrice: async () => {
      throw new Error("Oracle permanently down");
    },
    retryConfig: { maxDurationMs: 50, baseDelayMs: 10 },
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "error");
  assert.ok(result.escalation, "should have escalation signal");
  assert.equal(result.escalation!.requiresAdminOverride, true);
  assert.equal(result.escalation!.failedMarkets.length, 2);

  for (const fm of result.escalation!.failedMarkets) {
    assert.equal(fm.adminOverrideAvailableAfterTs, MARKET_CLOSE_UTC + 3600);
  }
});

test("all markets succeed → no escalation", async () => {
  const result = await runSettleMarketsJob(makeMockDeps());
  assert.equal(result.status, "success");
  assert.equal(result.escalation, undefined);
});

test("mixed results → escalation.failedMarkets only contains failures", async () => {
  const deps = makeMockDeps({
    settleMarketOnChain: async (market) => {
      if (market.ticker === "META") {
        throw new Error("META settlement failed");
      }
      return { settled: true, txSignature: "aapl-sig" };
    },
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "partial");
  assert.ok(result.escalation, "should have escalation for partial failure");
  assert.equal(result.escalation!.requiresAdminOverride, true);
  assert.equal(result.escalation!.failedMarkets.length, 1);
  assert.equal(result.escalation!.failedMarkets[0].ticker, "META");
});
