import assert from "node:assert/strict";
import test from "node:test";

import {
  MERIDIAN_TICKER_FEEDS,
  buildHermesLatestPriceFeedsUrl,
  buildHermesTimestampPriceUpdatesUrl,
  scalePriceToUsdcMicros,
  validateSettlementSnapshot,
} from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

import {
  fetchHermesPriceUpdatesAtTimestamp,
  fetchLatestPriceSnapshots,
} from "../../../automation/src/clients/hermes.js";

test("pins the seven supported MAG7 feed ids", () => {
  assert.deepEqual(Object.keys(MERIDIAN_TICKER_FEEDS), [
    "AAPL",
    "MSFT",
    "GOOGL",
    "AMZN",
    "NVDA",
    "META",
    "TSLA",
  ]);
});

test("builds the Hermes latest price feed URL with repeated ids", () => {
  const url = buildHermesLatestPriceFeedsUrl([
    MERIDIAN_TICKER_FEEDS.AAPL,
    MERIDIAN_TICKER_FEEDS.MSFT,
  ]);

  assert.equal(
    url,
    "https://hermes.pyth.network/api/latest_price_feeds?ids[]=49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688&ids[]=d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
  );
});

test("builds the Hermes timestamp update URL for pull-oracle settlement", () => {
  const url = buildHermesTimestampPriceUpdatesUrl(1_763_504_400, [
    MERIDIAN_TICKER_FEEDS.META,
  ]);

  assert.equal(
    url,
    "https://hermes.pyth.network/v2/updates/price/1763504400?ids[]=78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe&encoding=base64",
  );
});

test("accepts a settlement snapshot that is fresh, pre-close, and within confidence limits", () => {
  const result = validateSettlementSnapshot(makeHermesSnapshot("META", {
    price: "6842300000",
    conf: "684230",
    publish_time: 1_763_504_160,
  }), {
    expectedFeedId: MERIDIAN_TICKER_FEEDS.META,
    marketCloseTs: 1_763_504_400,
    settlementTs: 1_763_504_460,
    maximumAgeSeconds: 600,
    confidenceLimitBps: 25,
  });

  assert.equal(result.publishTime, 1_763_504_160);
  assert.equal(result.priceMicros, 68_423_000n);
  assert.equal(result.confidenceRatioBps, 1);
});

test("rejects a settlement snapshot published after market close", () => {
  assert.throws(
    () =>
      validateSettlementSnapshot(makeHermesSnapshot("NVDA", {
        price: "12050000000",
        conf: "1205000",
        publish_time: 1_763_504_401,
      }), {
        expectedFeedId: MERIDIAN_TICKER_FEEDS.NVDA,
        marketCloseTs: 1_763_504_400,
        settlementTs: 1_763_504_460,
        maximumAgeSeconds: 600,
        confidenceLimitBps: 25,
      }),
    /after market close/,
  );
});

test("rejects a stale settlement snapshot", () => {
  assert.throws(
    () =>
      validateSettlementSnapshot(makeHermesSnapshot("AMZN", {
        price: "20000000000",
        publish_time: 1_763_503_700,
      }), {
        expectedFeedId: MERIDIAN_TICKER_FEEDS.AMZN,
        marketCloseTs: 1_763_504_400,
        settlementTs: 1_763_504_460,
        maximumAgeSeconds: 600,
        confidenceLimitBps: 25,
      }),
    /too old/,
  );
});

test("rejects a settlement snapshot when the confidence band is too wide", () => {
  assert.throws(
    () =>
      validateSettlementSnapshot(makeHermesSnapshot("GOOGL", {
        price: "17500000000",
        conf: "87500000",
      }), {
        expectedFeedId: MERIDIAN_TICKER_FEEDS.GOOGL,
        marketCloseTs: 1_763_504_400,
        settlementTs: 1_763_504_460,
        maximumAgeSeconds: 600,
        confidenceLimitBps: 25,
      }),
    /confidence band/,
  );
});

test("scales Pyth prices into the program's 6-decimal fixed-point format", () => {
  assert.equal(scalePriceToUsdcMicros("6842300000", -8), 68_423_000n);
  assert.equal(scalePriceToUsdcMicros("230", 0), 230_000_000n);
  assert.equal(scalePriceToUsdcMicros("12345", -2), 123_450_000n);
});

test("fetches latest Hermes price snapshots for configured feeds", async () => {
  const seenUrls: string[] = [];
  const snapshots = await fetchLatestPriceSnapshots(
    [MERIDIAN_TICKER_FEEDS.AAPL],
    async (input) => {
      seenUrls.push(String(input));
      return new Response(JSON.stringify([makeHermesSnapshot("AAPL")]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );

  assert.deepEqual(seenUrls, [
    "https://hermes.pyth.network/api/latest_price_feeds?ids[]=49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  ]);
  assert.equal(snapshots[0]?.id, MERIDIAN_TICKER_FEEDS.AAPL);
});

test("fetches Hermes binary price updates for a target publish time", async () => {
  const seenUrls: string[] = [];
  const response = await fetchHermesPriceUpdatesAtTimestamp(
    1_763_504_400,
    [MERIDIAN_TICKER_FEEDS.META],
    async (input) => {
      seenUrls.push(String(input));
      return new Response(
        JSON.stringify({
          binary: {
            encoding: "base64",
            data: ["ZmFrZS11cGRhdGU="],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  );

  assert.deepEqual(seenUrls, [
    "https://hermes.pyth.network/v2/updates/price/1763504400?ids[]=78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe&encoding=base64",
  ]);
  assert.deepEqual(response.binary.data, ["ZmFrZS11cGRhdGU="]);
});
