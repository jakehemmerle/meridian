import assert from "node:assert/strict";
import test from "node:test";

import { MERIDIAN_TICKER_FEEDS } from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

import {
  makeValidatedFetchSettlementPrice,
} from "../../../automation/src/jobs/settlement-deps.js";

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
