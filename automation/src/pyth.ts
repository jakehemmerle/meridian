export const HERMES_BASE_URL = "https://hermes.pyth.network";

export const MERIDIAN_TICKER_FEEDS = {
  AAPL: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  MSFT: "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
  GOOGL: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
  AMZN: "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
  NVDA: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  META: "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe",
  TSLA: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
} as const;

export type MeridianTicker = keyof typeof MERIDIAN_TICKER_FEEDS;

export interface HermesPriceSnapshot {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

export interface HermesBinaryPriceUpdateResponse {
  binary: {
    encoding: string;
    data: string[];
  };
}

export interface SettlementValidationInput {
  expectedFeedId: string;
  marketCloseTs: number;
  settlementTs: number;
  maximumAgeSeconds: number;
  confidenceLimitBps: number;
}

export interface ValidatedSettlementSnapshot {
  feedId: string;
  publishTime: number;
  price: bigint;
  confidence: bigint;
  exponent: number;
  priceMicros: bigint;
  confidenceRatioBps: number;
}

type FetchLike = typeof fetch;

export function buildHermesLatestPriceFeedsUrl(
  ids: readonly string[],
  hermesBaseUrl = HERMES_BASE_URL,
): string {
  return buildHermesUrl("/api/latest_price_feeds", ids, hermesBaseUrl);
}

export function buildHermesTimestampPriceUpdatesUrl(
  publishTime: number,
  ids: readonly string[],
  hermesBaseUrl = HERMES_BASE_URL,
): string {
  return buildHermesUrl(`/v2/updates/price/${publishTime}`, ids, hermesBaseUrl, [
    ["encoding", "base64"],
  ]);
}

export async function fetchLatestPriceSnapshots(
  ids: readonly string[],
  fetchImpl: FetchLike = fetch,
  hermesBaseUrl = HERMES_BASE_URL,
): Promise<HermesPriceSnapshot[]> {
  const response = await fetchImpl(buildHermesLatestPriceFeedsUrl(ids, hermesBaseUrl));
  if (!response.ok) {
    throw new Error(`Hermes latest price feed request failed with status ${response.status}.`);
  }

  return (await response.json()) as HermesPriceSnapshot[];
}

export async function fetchHermesPriceUpdatesAtTimestamp(
  publishTime: number,
  ids: readonly string[],
  fetchImpl: FetchLike = fetch,
  hermesBaseUrl = HERMES_BASE_URL,
): Promise<HermesBinaryPriceUpdateResponse> {
  const response = await fetchImpl(
    buildHermesTimestampPriceUpdatesUrl(publishTime, ids, hermesBaseUrl),
  );
  if (!response.ok) {
    throw new Error(
      `Hermes timestamp price update request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as HermesBinaryPriceUpdateResponse;
}

export function scalePriceToUsdcMicros(price: string | bigint, exponent: number): bigint {
  const numericPrice = typeof price === "bigint" ? price : BigInt(price);
  if (numericPrice <= 0n) {
    throw new Error("Pyth prices must be positive for settlement.");
  }

  const decimals = exponent + 6;
  if (decimals >= 0) {
    return numericPrice * 10n ** BigInt(decimals);
  }

  const divisor = 10n ** BigInt(-decimals);
  return numericPrice / divisor;
}

export function validateSettlementSnapshot(
  snapshot: HermesPriceSnapshot,
  rules: SettlementValidationInput,
): ValidatedSettlementSnapshot {
  if (snapshot.id !== rules.expectedFeedId) {
    throw new Error("Settlement snapshot feed id does not match the configured ticker feed.");
  }

  const price = BigInt(snapshot.price.price);
  const confidence = BigInt(snapshot.price.conf);
  const publishTime = snapshot.price.publish_time;

  if (publishTime > rules.marketCloseTs) {
    throw new Error("Settlement snapshot was published after market close.");
  }

  if (publishTime + rules.maximumAgeSeconds < rules.settlementTs) {
    throw new Error("Settlement snapshot is too old for the configured maximum age.");
  }

  if (price <= 0n) {
    throw new Error("Settlement snapshot price must be positive.");
  }

  const confidenceRatioBps = Number((confidence * 10_000n) / price);
  if (confidenceRatioBps > rules.confidenceLimitBps) {
    throw new Error("Settlement snapshot confidence band exceeds the configured limit.");
  }

  return {
    feedId: snapshot.id,
    publishTime,
    price,
    confidence,
    exponent: snapshot.price.expo,
    priceMicros: scalePriceToUsdcMicros(price, snapshot.price.expo),
    confidenceRatioBps,
  };
}

function buildHermesUrl(
  path: string,
  ids: readonly string[],
  hermesBaseUrl: string,
  extraQuery: readonly [string, string][] = [],
): string {
  const query = [
    ...ids.map((id) => `ids[]=${id}`),
    ...extraQuery.map(([key, value]) => `${key}=${value}`),
  ].join("&");
  const trimmedBase = hermesBaseUrl.endsWith("/")
    ? hermesBaseUrl.slice(0, -1)
    : hermesBaseUrl;

  return query.length > 0 ? `${trimmedBase}${path}?${query}` : `${trimmedBase}${path}`;
}
