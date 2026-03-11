import {
  HERMES_BASE_URL,
  buildHermesLatestPriceFeedsUrl,
  buildHermesTimestampPriceUpdatesUrl,
  type HermesBinaryPriceUpdateResponse,
  type HermesPriceSnapshot,
} from "@meridian/domain";

type FetchLike = typeof fetch;

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
