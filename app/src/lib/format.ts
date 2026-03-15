export const PRICE_UNIT = 1_000_000;

/** Format micros (bigint | number) as "$X.XX" — universal convenience alias */
export function formatMicros(micros: bigint | number): string {
  const dollars = Number(micros) / PRICE_UNIT;
  return `$${dollars.toFixed(2)}`;
}

/** Format micros (number) as "$X.XX" */
export function formatUsd(micros: number): string {
  return `$${(micros / PRICE_UNIT).toFixed(2)}`;
}

/** Format micros (number) as signed "+$X.XX" or "-$X.XX" */
export function formatUsdSigned(micros: number): string {
  const abs = Math.abs(micros);
  const formatted = `$${(abs / PRICE_UNIT).toFixed(2)}`;
  if (micros < 0) return `-${formatted}`;
  return `+${formatted}`;
}

/** Format micros (bigint) as "$X.XX" */
export function formatUsdBigint(micros: bigint): string {
  const dollars = Number(micros) / PRICE_UNIT;
  return `$${dollars.toFixed(2)}`;
}

/** Format a token amount (bigint, 6 decimals) as "X.XX" without dollar sign */
export function formatTokenAmount(amount: bigint): string {
  return (Number(amount) / PRICE_UNIT).toFixed(2);
}
