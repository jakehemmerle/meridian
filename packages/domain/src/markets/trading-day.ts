export interface TradingDaySchedule {
  dateStr: string;
  marketOpenUtc: number;
  marketCloseUtc: number;
  morningJobUtc: number;
}

/**
 * Compute US Eastern market schedule for a given date.
 * All returned timestamps are in Unix seconds (UTC).
 */
export function getTradingDaySchedule(date: Date): TradingDaySchedule {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const offsetHours = isDst(year, month, day) ? 4 : 5;

  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const marketOpenUtc = Date.UTC(year, month, day, 9 + offsetHours, 30, 0) / 1000;
  const marketCloseUtc = Date.UTC(year, month, day, 16 + offsetHours, 0, 0) / 1000;
  const morningJobUtc = Date.UTC(year, month, day, 8 + offsetHours, 0, 0) / 1000;

  return { dateStr, marketOpenUtc, marketCloseUtc, morningJobUtc };
}

/** Check if a UTC date falls within US Eastern Daylight Time (second Sunday in March to first Sunday in November). */
function isDst(year: number, month: number, day: number): boolean {
  // month is 0-indexed: March=2, November=10
  if (month > 2 && month < 10) return true;
  if (month < 2 || month > 10) return false;

  if (month === 2) {
    // Second Sunday in March
    const secondSunday = secondSundayOfMonth(year, 2);
    return day >= secondSunday;
  }

  // First Sunday in November
  const firstSunday = firstSundayOfMonth(year, 10);
  return day < firstSunday;
}

function secondSundayOfMonth(year: number, month: number): number {
  const first = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = first.getUTCDay();
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return firstSunday + 7;
}

function firstSundayOfMonth(year: number, month: number): number {
  const first = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = first.getUTCDay();
  return dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
}
