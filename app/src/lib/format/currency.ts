export const PRICE_UNIT = 1_000_000;

export function formatUsd(micros: number): string {
  return `$${(micros / PRICE_UNIT).toFixed(2)}`;
}

export function formatSignedUsd(micros: number): string {
  const abs = Math.abs(micros);
  const formatted = `$${(abs / PRICE_UNIT).toFixed(2)}`;
  if (micros < 0) return `-${formatted}`;
  return `+${formatted}`;
}

export function formatTokenAmount(amount: bigint): string {
  return (Number(amount) / PRICE_UNIT).toFixed(2);
}

export function formatPayout(amount: bigint): string {
  return `$${(Number(amount) / PRICE_UNIT).toFixed(2)}`;
}
