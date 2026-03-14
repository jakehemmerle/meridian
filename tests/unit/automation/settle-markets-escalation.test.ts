import assert from "node:assert/strict";
import test from "node:test";

import { MERIDIAN_TICKER_FEEDS } from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

import {
  makeValidatedFetchSettlementPrice,
  buildSettlementDeps,
} from "../../../automation/src/jobs/settlement-deps.js";
import {
  runSettleMarketsJob,
  type SettleMarketsDeps,
  type SettlementLogger,
  type ActiveMarket,
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

// --- buildSettlementDeps tests ---

test("buildSettlementDeps returns valid SettleMarketsDeps with all required fields", () => {
  const activeMarkets: ActiveMarket[] = [
    {
      ticker: "AAPL",
      strikePrice: 230,
      meridianMarket: "aapl-pda",
      marketCloseUtc: MARKET_CLOSE_UTC,
    },
  ];

  const deps = buildSettlementDeps({
    activeMarkets,
    oracleConfig: { maximumAgeSeconds: 120, confidenceLimitBps: 100 },
    retryConfig: { maxDurationMs: 5000, baseDelayMs: 100 },
  });

  assert.ok(deps.activeMarkets);
  assert.equal(deps.activeMarkets.length, 1);
  assert.ok(deps.fetchSettlementPrice);
  assert.ok(deps.settleMarketOnChain);
  assert.ok(deps.retryConfig);
  assert.equal(deps.retryConfig.maxDurationMs, 5000);
  assert.equal(deps.retryConfig.baseDelayMs, 100);
});

test("buildSettlementDeps wires correct Pyth feed ID for each ticker", async () => {
  const activeMarkets: ActiveMarket[] = [
    {
      ticker: "NVDA",
      strikePrice: 900,
      meridianMarket: "nvda-pda",
      marketCloseUtc: MARKET_CLOSE_UTC,
    },
  ];

  const deps = buildSettlementDeps({
    activeMarkets,
    oracleConfig: { maximumAgeSeconds: 120, confidenceLimitBps: 100 },
    retryConfig: { maxDurationMs: 5000, baseDelayMs: 100 },
    innerFetchForTicker: async (ticker) =>
      makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
        publish_time: MARKET_CLOSE_UTC - 30,
      }),
  });

  // Should resolve with NVDA's feed ID
  const snapshot = await deps.fetchSettlementPrice("NVDA", MARKET_CLOSE_UTC);
  assert.equal(snapshot.id, MERIDIAN_TICKER_FEEDS.NVDA);
});

// --- Escalation logging tests ---

test("escalation logs contain ticker, failureCode, and meridianMarket for each failed market", async () => {
  const logEntries: Array<{ message: string; context: Record<string, unknown> }> = [];
  const mockLogger: SettlementLogger = {
    error: (message, context) => logEntries.push({ message, context }),
  };

  const deps = makeMockDeps({
    fetchSettlementPrice: async () => {
      throw new Error("Oracle permanently down");
    },
    retryConfig: { maxDurationMs: 50, baseDelayMs: 10 },
    logger: mockLogger,
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "error");

  // Should have logged one entry per failed market
  assert.equal(logEntries.length, 2);

  for (const entry of logEntries) {
    assert.equal(entry.message, "SETTLEMENT_ESCALATION");
    assert.ok(entry.context.ticker, "log should contain ticker");
    assert.ok(entry.context.failureCode, "log should contain failureCode");
    assert.ok(entry.context.meridianMarket, "log should contain meridianMarket");
    assert.ok(entry.context.strikePrice !== undefined, "log should contain strikePrice");
    assert.ok(entry.context.error, "log should contain error");
    assert.ok(entry.context.adminOverrideAvailableAfterTs, "log should contain admin override timestamp");
  }

  // Verify specific tickers
  const tickers = logEntries.map((e) => e.context.ticker);
  assert.ok(tickers.includes("AAPL"));
  assert.ok(tickers.includes("META"));
});

test("no escalation logs when all markets succeed", async () => {
  const logEntries: Array<{ message: string; context: Record<string, unknown> }> = [];
  const mockLogger: SettlementLogger = {
    error: (message, context) => logEntries.push({ message, context }),
  };

  const deps = makeMockDeps({ logger: mockLogger });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "success");
  assert.equal(logEntries.length, 0);
});

test("escalation logs only for failed markets in partial failure", async () => {
  const logEntries: Array<{ message: string; context: Record<string, unknown> }> = [];
  const mockLogger: SettlementLogger = {
    error: (message, context) => logEntries.push({ message, context }),
  };

  const deps = makeMockDeps({
    settleMarketOnChain: async (market) => {
      if (market.ticker === "META") {
        throw new Error("META settlement failed");
      }
      return { settled: true, txSignature: "aapl-sig" };
    },
    logger: mockLogger,
  });

  const result = await runSettleMarketsJob(deps);
  assert.equal(result.status, "partial");
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0].context.ticker, "META");
  assert.equal(logEntries[0].context.failureCode, "SETTLEMENT_TX_FAILED");
});
