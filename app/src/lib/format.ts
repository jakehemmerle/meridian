export const PRICE_UNIT = 1_000_000;

function microsToFixed(micros: number | bigint): string {
  return (Number(micros) / PRICE_UNIT).toFixed(2);
}

/** Format micros (number) as "$X.XX" */
export function formatUsd(micros: number): string {
  return `$${microsToFixed(micros)}`;
}

/** Format micros (number) as signed "+$X.XX" or "-$X.XX" */
export function formatUsdSigned(micros: number): string {
  const formatted = `$${microsToFixed(Math.abs(micros))}`;
  if (micros < 0) return `-${formatted}`;
  return `+${formatted}`;
}

/** Format micros (bigint) as "$X.XX" */
export function formatUsdBigint(micros: bigint): string {
  return `$${microsToFixed(micros)}`;
}

/** Format a token amount (bigint, 6 decimals) as "X.XX" without dollar sign */
export function formatTokenAmount(amount: bigint): string {
  return microsToFixed(amount);
}
