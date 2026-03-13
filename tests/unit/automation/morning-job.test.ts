import assert from "node:assert/strict";
import test from "node:test";

import { MERIDIAN_TICKER_FEEDS, MERIDIAN_TICKERS } from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

import {
  runMorningJob,
  type MorningJobDeps,
  type MorningJobResult,
} from "../../../automation/src/jobs/morning-job.js";

function makeMockDeps(overrides: Partial<MorningJobDeps> = {}): MorningJobDeps {
  return {
    fetchPriceSnapshots: async (ids) => {
      return Object.entries(MERIDIAN_TICKER_FEEDS).map(([ticker, feedId]) =>
        makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
          price: "68000000000",  // $680
          expo: -8,
        }),
      );
    },
    createMarketOnChain: async (_ticker, _strike, _tradingDay) => ({
      meridianMarket: "market-pda",
      yesMint: "yes-mint-pda",
    }),
    createPhoenixMarket: async (_ticker, _strike, _tradingDay, _meridianMarket, _yesMint) => ({
      phoenixMarket: "phoenix-market",
    }),
    tradingDate: new Date("2026-03-12T12:00:00Z"),
    ...overrides,
  };
}

test("happy path: fetches prices, generates strikes, creates markets for all tickers", async () => {
  const result = await runMorningJob(makeMockDeps());

  assert.equal(result.status, "success");
  assert.equal(result.job, "morning-job");
  assert.equal(result.tickerResults.length, MERIDIAN_TICKERS.length);

  for (const tr of result.tickerResults) {
    assert.equal(tr.status, "success");
    assert.ok(tr.strikes.length > 0, `${tr.ticker} should have strikes`);
    for (const sr of tr.strikes) {
      assert.equal(sr.status, "success");
    }
  }
});

test("oracle failure for one ticker does not block others", async () => {
  let callCount = 0;
  const deps = makeMockDeps({
    fetchPriceSnapshots: async (ids) => {
      // Return snapshots but with one bad ticker (META)
      return Object.entries(MERIDIAN_TICKER_FEEDS).map(([ticker, feedId]) => {
        if (ticker === "META") {
          // Return snapshot with zero price (will cause error in price conversion)
          return makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
            price: "0",
            expo: -8,
          });
        }
        return makeHermesSnapshot(ticker as keyof typeof MERIDIAN_TICKER_FEEDS, {
          price: "23000000000",
          expo: -8,
        });
      });
    },
  });

  const result = await runMorningJob(deps);

  // Should be partial since META failed
  assert.equal(result.status, "partial");
  const metaResult = result.tickerResults.find((t) => t.ticker === "META");
  assert.ok(metaResult);
  assert.equal(metaResult.status, "error");

  // Other tickers should succeed
  const otherResults = result.tickerResults.filter((t) => t.ticker !== "META");
  for (const tr of otherResults) {
    assert.equal(tr.status, "success", `${tr.ticker} should succeed`);
  }
});

test("market creation failure for one strike does not block other strikes", async () => {
  let strikeCallCount = 0;
  const deps = makeMockDeps({
    createMarketOnChain: async (_ticker, strike, _tradingDay) => {
      strikeCallCount++;
      if (strikeCallCount === 1) {
        throw new Error("on-chain creation failed");
      }
      return { meridianMarket: "market-pda", yesMint: "yes-mint-pda" };
    },
  });

  const result = await runMorningJob(deps);

  // Should be partial since one strike failed
  assert.equal(result.status, "partial");
  // At least one ticker should have a mix of success and error strikes
  const hasPartial = result.tickerResults.some(
    (tr) => tr.strikes.some((s) => s.status === "error") && tr.strikes.some((s) => s.status === "success"),
  );
  assert.ok(hasPartial, "should have at least one ticker with mixed strike results");
});

test("result correctly reports partial success counts", async () => {
  const deps = makeMockDeps();
  const result = await runMorningJob(deps);

  assert.equal(result.job, "morning-job");
  assert.ok(result.detail.length > 0, "should have a detail string");
  assert.equal(result.tickerResults.length, 7, "should have results for all 7 tickers");
});
