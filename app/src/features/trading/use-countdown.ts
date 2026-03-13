import { useEffect, useState } from "react";
import { getCountdownSeconds } from "./model";

function formatCountdownTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function createCountdownProcessor(
  marketCloseUtc: number,
  now: () => number = () => Math.floor(Date.now() / 1000),
) {
  let seconds = getCountdownSeconds(marketCloseUtc, now());
  let onChange: ((s: number) => void) | null = null;

  return {
    getSeconds: () => getCountdownSeconds(marketCloseUtc, now()),
    setOnChange: (cb: (s: number) => void) => {
      onChange = cb;
    },
    tick: () => {
      seconds = getCountdownSeconds(marketCloseUtc, now());
      onChange?.(seconds);
    },
    format: () => formatCountdownTime(getCountdownSeconds(marketCloseUtc, now())),
  };
}

export function useCountdown(marketCloseUtc: number): {
  seconds: number;
  formatted: string;
} {
  const [seconds, setSeconds] = useState(() =>
    getCountdownSeconds(marketCloseUtc, Math.floor(Date.now() / 1000)),
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      const s = getCountdownSeconds(
        marketCloseUtc,
        Math.floor(Date.now() / 1000),
      );
      setSeconds(s);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [marketCloseUtc]);

  return { seconds, formatted: formatCountdownTime(seconds) };
}
