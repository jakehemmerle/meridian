export const PRICE_UNIT = 1_000_000;

export function formatMicros(micros: bigint | number): string {
  const dollars = Number(micros) / PRICE_UNIT;
  return `$${dollars.toFixed(2)}`;
}
