import assert from "node:assert/strict";
import test from "node:test";

import { invertYesLadderToNo, type OrderBookLadder } from "@meridian/domain";

test("invertYesLadderToNo inverts prices and flips bid↔ask", () => {
  const yesLadder: OrderBookLadder = {
    bids: [
      { priceMicros: 700_000, sizeLots: 10 },
      { priceMicros: 600_000, sizeLots: 20 },
    ],
    asks: [
      { priceMicros: 800_000, sizeLots: 5 },
      { priceMicros: 900_000, sizeLots: 15 },
    ],
  };

  const noLadder = invertYesLadderToNo(yesLadder);

  // Yes asks become No bids (inverted price)
  // Yes ask 800_000 → No bid 200_000, Yes ask 900_000 → No bid 100_000
  assert.deepEqual(noLadder.bids, [
    { priceMicros: 200_000, sizeLots: 5 },
    { priceMicros: 100_000, sizeLots: 15 },
  ]);

  // Yes bids become No asks (inverted price)
  // Yes bid 700_000 → No ask 300_000, Yes bid 600_000 → No ask 400_000
  assert.deepEqual(noLadder.asks, [
    { priceMicros: 300_000, sizeLots: 10 },
    { priceMicros: 400_000, sizeLots: 20 },
  ]);
});

test("invertYesLadderToNo with empty ladder returns empty", () => {
  const empty: OrderBookLadder = { bids: [], asks: [] };
  const result = invertYesLadderToNo(empty);
  assert.deepEqual(result.bids, []);
  assert.deepEqual(result.asks, []);
});

test("invertYesLadderToNo: multiple levels sorted correctly after inversion", () => {
  const yesLadder: OrderBookLadder = {
    bids: [
      { priceMicros: 500_000, sizeLots: 1 },
      { priceMicros: 400_000, sizeLots: 2 },
      { priceMicros: 300_000, sizeLots: 3 },
    ],
    asks: [
      { priceMicros: 600_000, sizeLots: 4 },
      { priceMicros: 700_000, sizeLots: 5 },
      { priceMicros: 800_000, sizeLots: 6 },
    ],
  };

  const noLadder = invertYesLadderToNo(yesLadder);

  // No bids (from yes asks, inverted): 400_000, 300_000, 200_000 — descending
  assert.equal(noLadder.bids.length, 3);
  assert.ok(noLadder.bids[0].priceMicros >= noLadder.bids[1].priceMicros);
  assert.ok(noLadder.bids[1].priceMicros >= noLadder.bids[2].priceMicros);

  // No asks (from yes bids, inverted): 500_000, 600_000, 700_000 — ascending
  assert.equal(noLadder.asks.length, 3);
  assert.ok(noLadder.asks[0].priceMicros <= noLadder.asks[1].priceMicros);
  assert.ok(noLadder.asks[1].priceMicros <= noLadder.asks[2].priceMicros);
});
