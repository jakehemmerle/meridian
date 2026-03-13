export interface StrikeGenerationConfig {
  percentageOffsets: number[];
  roundingIncrement: number;
  includeRoundedClose: boolean;
}

export const DEFAULT_STRIKE_CONFIG: StrikeGenerationConfig = {
  percentageOffsets: [0.03, 0.06, 0.09],
  roundingIncrement: 10,
  includeRoundedClose: true,
};

export function generateStrikes(
  previousClose: number,
  config: StrikeGenerationConfig = DEFAULT_STRIKE_CONFIG,
): number[] {
  const { percentageOffsets, roundingIncrement, includeRoundedClose } = config;
  const raw = new Set<number>();

  for (const offset of percentageOffsets) {
    raw.add(Math.round((previousClose * (1 - offset)) / roundingIncrement) * roundingIncrement);
    raw.add(Math.round((previousClose * (1 + offset)) / roundingIncrement) * roundingIncrement);
  }

  if (includeRoundedClose) {
    raw.add(Math.round(previousClose / roundingIncrement) * roundingIncrement);
  }

  return [...raw].sort((a, b) => a - b);
}

export function pythPriceToDollars(price: string, expo: number): number {
  return Number(price) * 10 ** expo;
}
