import assert from "node:assert/strict";
import test from "node:test";

import { MERIDIAN_TICKER_FEEDS } from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

import {
  runAfternoonJob,
  type AfternoonJobDeps,
  type AfternoonJobResult,
} from "../../../automation/src/jobs/afternoon-job.js";

const MARKET_CLOSE_UTC = 1_763_504_400;

function makeMarketEntry(ticker: string, strikePrice: number) {
  return {
    ticker,
    strikePrice,
    meridianMarket: `${ticker.toLowerCase()}-market-pda`,
    phoenixMarket: `${ticker.toLowerCase()}-phoenix-pda`,
    marketCloseUtc: MARKET_CLOSE_UTC,
  };
}

function makeMockDeps(overrides: Partial<AfternoonJobDeps> = {}): AfternoonJobDeps {
  return {
    activeMarkets: [
      makeMarketEntry("AAPL", 230),
      makeMarketEntry("META", 680),
    ],
    closePhoenixMarket: async () => ({ txSignature: "phoenix-close-sig" }),
    closeMeridianMarket: async () => ({ txSignature: "meridian-close-sig" }),
    fetchSettlementPrice: async (ticker, _marketCloseUtc) => {
      return makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
        price: "23000000000",
        conf: "1000000",
        expo: -8,
        publish_time: MARKET_CLOSE_UTC - 60,
      });
    },
    settleMarketOnChain: async () => ({ settled: true, txSignature: "settle-sig" }),
    retryConfig: { maxDurationMs: 100, baseDelayMs: 10 },
    ...overrides,
  };
}

// --- Happy-path orchestration ---

test("happy path: closes and settles all markets", async () => {
  const result = await runAfternoonJob(makeMockDeps());

  assert.equal(result.status, "success");
  assert.equal(result.job, "afternoon-job");
  assert.equal(result.closeResult.status, "success");
  assert.equal(result.settleResult.status, "success");
  assert.equal(result.settleResult.settlements.length, 2);

  for (const s of result.settleResult.settlements) {
    assert.equal(s.status, "success");
    assert.ok(s.txSignature);
  }
});

test("happy path: detail includes both close and settle summary", async () => {
  const result = await runAfternoonJob(makeMockDeps());
  assert.ok(result.detail.includes("close"), "detail should mention close");
  assert.ok(result.detail.includes("settle"), "detail should mention settle");
});

// --- Retry-until-success orchestration ---

test("retries stale oracle during settlement, eventually succeeds", async () => {
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

  const result = await runAfternoonJob(deps);
  assert.equal(result.status, "success");
  assert.equal(result.closeResult.status, "success");
  assert.equal(result.settleResult.status, "success");
  assert.ok(fetchCount >= 3, "should have retried fetching");
});

// --- Retry-exhausted escalation ---

test("escalates when oracle is permanently down after retry exhaustion", async () => {
  const deps = makeMockDeps({
    fetchSettlementPrice: async () => {
      throw new Error("Oracle permanently down");
    },
    retryConfig: { maxDurationMs: 50, baseDelayMs: 10 },
  });

  const result = await runAfternoonJob(deps);
  assert.equal(result.status, "error");
  assert.equal(result.closeResult.status, "success");
  assert.equal(result.settleResult.status, "error");
  assert.ok(result.settleResult.escalation, "should have escalation signal");
  assert.equal(result.settleResult.escalation!.requiresAdminOverride, true);
  assert.equal(result.settleResult.escalation!.failedMarkets.length, 2);

  for (const fm of result.settleResult.escalation!.failedMarkets) {
    assert.equal(fm.adminOverrideAvailableAfterTs, MARKET_CLOSE_UTC + 3600);
  }
});

// --- Close failure blocks settlement ---

test("close failure for one market still settles the other", async () => {
  const deps = makeMockDeps({
    closePhoenixMarket: async (phoenixMarket) => {
      if (phoenixMarket === "meta-phoenix-pda") {
        throw new Error("Phoenix close failed for META");
      }
      return { txSignature: "phoenix-close-sig" };
    },
  });

  const result = await runAfternoonJob(deps);
  assert.equal(result.status, "partial");
  assert.equal(result.closeResult.status, "partial");

  // Only AAPL should be settled (META failed to close)
  assert.equal(result.settleResult.settlements.length, 1);
  assert.equal(result.settleResult.settlements[0].ticker, "AAPL");
  assert.equal(result.settleResult.settlements[0].status, "success");
});

test("all markets fail to close → no settlement attempted", async () => {
  const deps = makeMockDeps({
    closePhoenixMarket: async () => {
      throw new Error("Phoenix down");
    },
  });

  const result = await runAfternoonJob(deps);
  assert.equal(result.status, "error");
  assert.equal(result.closeResult.status, "error");
  assert.equal(result.settleResult.settlements.length, 0);
});

// --- Already-closed idempotency ---

test("already-closed markets are included in settlement", async () => {
  const deps = makeMockDeps({
    closePhoenixMarket: async () => {
      throw Object.assign(new Error("already closed"), {});
    },
    closeMeridianMarket: async () => {
      throw Object.assign(new Error("already closed"), {});
    },
  });

  const result = await runAfternoonJob(deps);
  // Skipped closures are OK — markets are still settleable
  assert.equal(result.status, "success");
  assert.equal(result.settleResult.settlements.length, 2);
});

// --- Mixed settlement failures ---

test("partial settlement failure generates escalation for failed markets only", async () => {
  const deps = makeMockDeps({
    settleMarketOnChain: async (market) => {
      if (market.ticker === "META") {
        throw new Error("META settlement tx failed");
      }
      return { settled: true, txSignature: "aapl-sig" };
    },
  });

  const result = await runAfternoonJob(deps);
  assert.equal(result.status, "partial");
  assert.equal(result.settleResult.status, "partial");
  assert.ok(result.settleResult.escalation);
  assert.equal(result.settleResult.escalation!.failedMarkets.length, 1);
  assert.equal(result.settleResult.escalation!.failedMarkets[0].ticker, "META");
});
