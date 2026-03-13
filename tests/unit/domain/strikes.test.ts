import assert from "node:assert/strict";
import test from "node:test";

import {
  generateStrikes,
  pythPriceToDollars,
  DEFAULT_STRIKE_CONFIG,
} from "@meridian/domain";

test("generates strikes for META prev close $680", () => {
  const strikes = generateStrikes(680);
  assert.deepEqual(strikes, [620, 640, 660, 680, 700, 720, 740]);
});

test("generates strikes for AAPL prev close $230 with dedup", () => {
  const strikes = generateStrikes(230);
  // 230 * 0.97 = 223.1 → 220, 230 * 0.94 = 216.2 → 220 (dup), 230 * 0.91 = 209.3 → 210
  // 230 * 1.03 = 236.9 → 240, 230 * 1.06 = 243.8 → 240 (dup), 230 * 1.09 = 250.7 → 250
  // rounded close = 230
  // unique sorted: [210, 220, 230, 240, 250]
  assert.deepEqual(strikes, [210, 220, 230, 240, 250]);
});

test("deduplication removes strikes that round to same value", () => {
  const strikes = generateStrikes(230);
  const unique = new Set(strikes);
  assert.equal(strikes.length, unique.size, "no duplicate strikes");
});

test("strikes are sorted ascending", () => {
  const strikes = generateStrikes(500);
  for (let i = 1; i < strikes.length; i++) {
    assert.ok(strikes[i]! > strikes[i - 1]!, `strikes[${i}] > strikes[${i - 1}]`);
  }
});

test("custom config with different offsets and rounding", () => {
  const strikes = generateStrikes(100, {
    percentageOffsets: [0.05, 0.10],
    roundingIncrement: 5,
    includeRoundedClose: true,
  });
  // 100 * 0.95 = 95, 100 * 0.90 = 90, 100 * 1.05 = 105, 100 * 1.10 = 110, close = 100
  assert.deepEqual(strikes, [90, 95, 100, 105, 110]);
});

test("edge: very low price ($15) has heavy dedup", () => {
  const strikes = generateStrikes(15);
  // 15 * 0.97 = 14.55 → 10, 15 * 0.94 = 14.10 → 10, 15 * 0.91 = 13.65 → 10
  // 15 * 1.03 = 15.45 → 20, 15 * 1.06 = 15.90 → 20, 15 * 1.09 = 16.35 → 20
  // rounded close = 20
  // unique sorted: [10, 20]
  assert.deepEqual(strikes, [10, 20]);
});

test("edge: very high price ($3000) has no dedup", () => {
  const strikes = generateStrikes(3000);
  // 3000 * 0.97 = 2910, 3000 * 0.94 = 2820, 3000 * 0.91 = 2730
  // 3000 * 1.03 = 3090, 3000 * 1.06 = 3180, 3000 * 1.09 = 3270
  // rounded close = 3000
  assert.deepEqual(strikes, [2730, 2820, 2910, 3000, 3090, 3180, 3270]);
});

test("includeRoundedClose: false produces 6 max strikes", () => {
  const strikes = generateStrikes(680, {
    ...DEFAULT_STRIKE_CONFIG,
    includeRoundedClose: false,
  });
  // without close: 620, 640, 660, 700, 720, 740
  assert.deepEqual(strikes, [620, 640, 660, 700, 720, 740]);
  assert.ok(strikes.length <= 6);
});

test("pythPriceToDollars converts Pyth price to dollar amount", () => {
  // META: price "6842300000" with expo -8 → $68.423
  assert.equal(pythPriceToDollars("6842300000", -8), 68.423);
  // AAPL: price "23000000000" with expo -8 → $230
  assert.equal(pythPriceToDollars("23000000000", -8), 230);
  // Simple: price "230" with expo 0 → $230
  assert.equal(pythPriceToDollars("230", 0), 230);
});
