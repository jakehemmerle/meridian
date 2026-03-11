import { MERIDIAN_TICKER_FEEDS, type HermesPriceSnapshot } from "@meridian/domain";

export function makeHermesSnapshot(
  ticker: keyof typeof MERIDIAN_TICKER_FEEDS,
  overrides: Partial<HermesPriceSnapshot["price"]> = {},
): HermesPriceSnapshot {
  return {
    id: MERIDIAN_TICKER_FEEDS[ticker],
    price: {
      price: "23000000000",
      conf: "1000000",
      expo: -8,
      publish_time: 1_763_504_200,
      ...overrides,
    },
  };
}
