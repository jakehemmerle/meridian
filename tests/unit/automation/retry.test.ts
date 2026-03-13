import assert from "node:assert/strict";
import test from "node:test";

import { retryWithBackoff, type RetryResult } from "../../../automation/src/jobs/retry.js";

test("returns result on first success", async () => {
  const result = await retryWithBackoff(async () => "ok", {
    maxDurationMs: 5000,
    baseDelayMs: 10,
  });

  assert.deepEqual(result, { ok: true, value: "ok" });
});

test("retries on failure, eventually succeeds", async () => {
  let attempts = 0;
  const result = await retryWithBackoff(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error("not yet");
      return "done";
    },
    { maxDurationMs: 5000, baseDelayMs: 10 },
  );

  assert.deepEqual(result, { ok: true, value: "done" });
  assert.equal(attempts, 3);
});

test("returns error after max duration exceeded", async () => {
  const result = await retryWithBackoff(
    async () => {
      throw new Error("always fails");
    },
    { maxDurationMs: 50, baseDelayMs: 10 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /always fails/);
  }
});

test("respects abort signal", async () => {
  const controller = new AbortController();
  // Abort immediately
  controller.abort();

  const result = await retryWithBackoff(
    async () => {
      throw new Error("should not retry");
    },
    { maxDurationMs: 60000, baseDelayMs: 10, signal: controller.signal },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /abort/i);
  }
});
