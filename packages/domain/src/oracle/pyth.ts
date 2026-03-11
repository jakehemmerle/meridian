export const HERMES_BASE_URL = "https://hermes.pyth.network";

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
