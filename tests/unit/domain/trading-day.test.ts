import assert from "node:assert/strict";
import test from "node:test";

import { getTradingDaySchedule } from "@meridian/domain";

test("returns correct ET timestamps for a known date (2026-03-12)", () => {
  // 2026-03-12 is a Thursday, EDT (UTC-4) starts March 8 2026
  const schedule = getTradingDaySchedule(new Date("2026-03-12T12:00:00Z"));

  // Market open: 9:30 AM ET = 13:30 UTC
  assert.equal(schedule.marketOpenUtc, Date.UTC(2026, 2, 12, 13, 30, 0) / 1000);
  // Market close: 4:00 PM ET = 20:00 UTC
  assert.equal(schedule.marketCloseUtc, Date.UTC(2026, 2, 12, 20, 0, 0) / 1000);
  // Morning job: 8:00 AM ET = 12:00 UTC
  assert.equal(schedule.morningJobUtc, Date.UTC(2026, 2, 12, 12, 0, 0) / 1000);
});

test("close time is always 4:00 PM ET", () => {
  // Test in EST (before DST): 2026-01-15
  const winter = getTradingDaySchedule(new Date("2026-01-15T12:00:00Z"));
  // 4:00 PM EST = 21:00 UTC
  assert.equal(winter.marketCloseUtc, Date.UTC(2026, 0, 15, 21, 0, 0) / 1000);

  // Test in EDT (after DST): 2026-06-15
  const summer = getTradingDaySchedule(new Date("2026-06-15T12:00:00Z"));
  // 4:00 PM EDT = 20:00 UTC
  assert.equal(summer.marketCloseUtc, Date.UTC(2026, 5, 15, 20, 0, 0) / 1000);
});

test("morning job time is always 8:00 AM ET", () => {
  // EST: 8:00 AM EST = 13:00 UTC
  const winter = getTradingDaySchedule(new Date("2026-01-15T12:00:00Z"));
  assert.equal(winter.morningJobUtc, Date.UTC(2026, 0, 15, 13, 0, 0) / 1000);

  // EDT: 8:00 AM EDT = 12:00 UTC
  const summer = getTradingDaySchedule(new Date("2026-06-15T12:00:00Z"));
  assert.equal(summer.morningJobUtc, Date.UTC(2026, 5, 15, 12, 0, 0) / 1000);
});

test("returns the date string in YYYY-MM-DD format", () => {
  const schedule = getTradingDaySchedule(new Date("2026-03-12T12:00:00Z"));
  assert.equal(schedule.dateStr, "2026-03-12");
});
