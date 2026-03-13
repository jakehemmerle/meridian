import assert from "node:assert/strict";
import test from "node:test";

import { MERIDIAN_TICKER_FEEDS } from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

import {
  runSettleMarketsJob,
  type SettleMarketsDeps,
  type SettleMarketsJobResult,
} from "../../../automation/src/jobs/settle-markets.js";

function makeMockDeps(overrides: Partial<SettleMarketsDeps> = {}): SettleMarketsDeps {
  return {
    activeMarkets: [
      {
        ticker: "AAPL",
        strikePrice: 230,
        meridianMarket: "aapl-market-pda",
        marketCloseUtc: 1_763_504_400,
      },
      {
        ticker: "META",
        strikePrice: 680,
        meridianMarket: "meta-market-pda",
        marketCloseUtc: 1_763_504_400,
      },
    ],
    fetchSettlementPrice: async (ticker, marketCloseUtc) => {
      return makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
        price: "23000000000",
        conf: "1000000",
        expo: -8,
        publish_time: marketCloseUtc - 60,
      });
    },
    settleMarketOnChain: async (_market, _snapshot) => {
      return { settled: true, txSignature: "fake-sig" };
    },
    retryConfig: { maxDurationMs: 100, baseDelayMs: 10 },
    ...overrides,
  };
}

test("happy path: settles all markets with valid oracle", async () => {
  const result = await runSettleMarketsJob(makeMockDeps());

  assert.equal(result.status, "success");
  assert.equal(result.job, "settle-markets");
  assert.equal(result.settlements.length, 2);

  for (const s of result.settlements) {
    assert.equal(s.status, "success");
    assert.ok(s.txSignature);
  }
});

test("retries on stale oracle, succeeds within window", async () => {
  let fetchCount = 0;
  const deps = makeMockDeps({
    fetchSettlementPrice: async (ticker, marketCloseUtc) => {
      fetchCount++;
      if (fetchCount <= 2) {
        throw new Error("Oracle temporarily unavailable");
      }
      return makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
        price: "23000000000",
        conf: "1000000",
        expo: -8,
        publish_time: marketCloseUtc - 60,
      });
    },
    retryConfig: { maxDurationMs: 5000, baseDelayMs: 10 },
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "success");
  assert.ok(fetchCount >= 3, "should have retried fetching");
});

test("escalates to admin override after retry exhaustion", async () => {
  const deps = makeMockDeps({
    fetchSettlementPrice: async () => {
      throw new Error("Oracle permanently down");
    },
    retryConfig: { maxDurationMs: 50, baseDelayMs: 10 },
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "error");

  for (const s of result.settlements) {
    assert.equal(s.status, "error");
    assert.ok(s.error);
    assert.match(s.failureCode!, /ORACLE_FETCH_FAILED/);
  }
});

test("reports correct failure codes for on-chain settlement errors", async () => {
  const deps = makeMockDeps({
    settleMarketOnChain: async () => {
      throw new Error("Transaction simulation failed");
    },
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "error");

  for (const s of result.settlements) {
    assert.equal(s.status, "error");
    assert.match(s.failureCode!, /SETTLEMENT_TX_FAILED/);
  }
});

test("mix of successful and failed settlements", async () => {
  let settleCallCount = 0;
  const deps = makeMockDeps({
    settleMarketOnChain: async (market) => {
      settleCallCount++;
      if (market.ticker === "META") {
        throw new Error("META settlement failed");
      }
      return { settled: true, txSignature: "aapl-sig" };
    },
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "partial");

  const aaplResult = result.settlements.find((s) => s.ticker === "AAPL");
  assert.ok(aaplResult);
  assert.equal(aaplResult.status, "success");

  const metaResult = result.settlements.find((s) => s.ticker === "META");
  assert.ok(metaResult);
  assert.equal(metaResult.status, "error");
});
