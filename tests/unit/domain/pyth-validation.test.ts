import assert from "node:assert/strict";
import test from "node:test";

import { scalePriceToUsdcMicros, validateSettlementSnapshot } from "@meridian/domain";
import { makeHermesSnapshot } from "@meridian/testkit";

const AAPL_FEED_ID = "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688";

function defaultRules() {
  return {
    expectedFeedId: AAPL_FEED_ID,
    marketCloseTs: 1_763_504_400,
    // publish_time from makeHermesSnapshot is 1_763_504_200
    // staleness check: publish_time + maximumAgeSeconds >= settlementTs
    // 1_763_504_200 + 600 = 1_763_504_800 >= 1_763_504_700 ✓
    settlementTs: 1_763_504_700,
    maximumAgeSeconds: 600,
    confidenceLimitBps: 250,
  };
}

// --- validateSettlementSnapshot ---

test("happy path validation passes", () => {
  const snapshot = makeHermesSnapshot("AAPL");
  const result = validateSettlementSnapshot(snapshot, defaultRules());

  assert.equal(result.feedId, AAPL_FEED_ID);
  assert.equal(result.publishTime, 1_763_504_200);
  assert.equal(result.price, 23000000000n);
  assert.equal(result.exponent, -8);
  assert.ok(result.priceMicros > 0n);
});

test("wrong feed ID rejected", () => {
  const snapshot = makeHermesSnapshot("AAPL");
  const rules = defaultRules();
  rules.expectedFeedId = "0000000000000000000000000000000000000000000000000000000000000000";

  assert.throws(
    () => validateSettlementSnapshot(snapshot, rules),
    /feed id does not match/,
  );
});

test("published after close rejected", () => {
  const snapshot = makeHermesSnapshot("AAPL", { publish_time: 1_763_504_401 });
  const rules = defaultRules();

  assert.throws(
    () => validateSettlementSnapshot(snapshot, rules),
    /published after market close/,
  );
});

test("stale price rejected", () => {
  // publish_time + maximumAgeSeconds < settlementTs → too old
  // 1_763_504_000 + 600 = 1_763_504_600 < 1_763_504_700 → stale
  const snapshot = makeHermesSnapshot("AAPL", { publish_time: 1_763_504_000 });
  const rules = defaultRules();

  assert.throws(
    () => validateSettlementSnapshot(snapshot, rules),
    /too old/,
  );
});

test("wide confidence rejected", () => {
  // conf/price ratio > 250 bps
  // price = 23000000000, 250bps = 2.5% → conf threshold = 575000000
  const snapshot = makeHermesSnapshot("AAPL", { conf: "600000000" });
  const rules = defaultRules();

  assert.throws(
    () => validateSettlementSnapshot(snapshot, rules),
    /confidence band exceeds/,
  );
});

test("negative price rejected", () => {
  const snapshot = makeHermesSnapshot("AAPL", { price: "-100" });
  const rules = defaultRules();

  assert.throws(
    () => validateSettlementSnapshot(snapshot, rules),
    /price must be positive/,
  );
});

test("zero price rejected", () => {
  const snapshot = makeHermesSnapshot("AAPL", { price: "0" });
  const rules = defaultRules();

  assert.throws(
    () => validateSettlementSnapshot(snapshot, rules),
    /price must be positive/,
  );
});

// --- scalePriceToUsdcMicros ---

test("scalePriceToUsdcMicros expo=-8: $230 stock price", () => {
  // price=23000000000 * 10^(-8+6) = 23000000000 * 10^-2 = 230000000 = $230
  const result = scalePriceToUsdcMicros("23000000000", -8);
  assert.equal(result, 230_000_000n);
});

test("scalePriceToUsdcMicros expo=-5: $230 stock price", () => {
  // price=23000000 * 10^(-5+6) = 23000000 * 10^1 = 230000000
  const result = scalePriceToUsdcMicros("23000000", -5);
  assert.equal(result, 230_000_000n);
});

test("scalePriceToUsdcMicros expo=0: large number", () => {
  // price=230 * 10^(0+6) = 230 * 1000000 = 230000000
  const result = scalePriceToUsdcMicros("230", 0);
  assert.equal(result, 230_000_000n);
});

test("scalePriceToUsdcMicros with bigint input", () => {
  const result = scalePriceToUsdcMicros(23000000000n, -8);
  assert.equal(result, 230_000_000n);
});

test("scalePriceToUsdcMicros rejects negative price", () => {
  assert.throws(
    () => scalePriceToUsdcMicros("-100", -8),
    /must be positive/,
  );
});

test("scalePriceToUsdcMicros rejects zero price", () => {
  assert.throws(
    () => scalePriceToUsdcMicros("0", -8),
    /must be positive/,
  );
});
