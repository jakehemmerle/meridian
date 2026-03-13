import { describe, it, expect, vi, afterEach } from "vitest";
import { createCountdownProcessor } from "./use-countdown";

describe("createCountdownProcessor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns remaining seconds before close", () => {
    const closeUtc = 1000;
    const processor = createCountdownProcessor(closeUtc, () => 400);
    expect(processor.getSeconds()).toBe(600);
  });

  it("returns 0 when past close", () => {
    const closeUtc = 1000;
    const processor = createCountdownProcessor(closeUtc, () => 1500);
    expect(processor.getSeconds()).toBe(0);
  });

  it("tick updates the value and fires onChange", () => {
    let now = 500;
    const processor = createCountdownProcessor(1000, () => now);

    const values: number[] = [];
    processor.setOnChange((s) => values.push(s));

    now = 600;
    processor.tick();
    expect(values).toEqual([400]);

    now = 999;
    processor.tick();
    expect(values).toEqual([400, 1]);
  });

  it("formats countdown as h:mm:ss", () => {
    const processor = createCountdownProcessor(10000, () => 10000 - 3661);
    expect(processor.format()).toBe("1:01:01");
  });

  it("formats zero countdown", () => {
    const processor = createCountdownProcessor(100, () => 200);
    expect(processor.format()).toBe("0:00:00");
  });
});
