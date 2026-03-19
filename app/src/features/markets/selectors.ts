import { MERIDIAN_TICKERS, type MeridianTicker } from "@meridian/domain";
import type { MarketSummary } from "./model";
import type { MarketQuote, MarketQuoteMap } from "./use-market-quotes";
import type { TickerSnapshot } from "./use-ticker-snapshots";

export interface StockOverview {
  ticker: MeridianTicker;
  livePriceMicros: bigint | null;
  activeContracts: number;
  totalContracts: number;
  featuredMarket: MarketSummary | null;
  featuredQuote: MarketQuote | null;
}

function getDistanceScore(
  market: MarketSummary,
  livePriceMicros: bigint | null,
): bigint {
  if (livePriceMicros == null) {
    return market.strikePriceMicros;
  }

  return market.strikePriceMicros > livePriceMicros
    ? market.strikePriceMicros - livePriceMicros
    : livePriceMicros - market.strikePriceMicros;
}

export function sortMarketsForTicker(
  markets: readonly MarketSummary[],
  livePriceMicros: bigint | null,
): MarketSummary[] {
  return [...markets].sort((left, right) => {
    if (left.phase !== right.phase) {
      const leftActive = left.phase === "Trading" ? 1 : 0;
      const rightActive = right.phase === "Trading" ? 1 : 0;
      if (leftActive !== rightActive) return rightActive - leftActive;
    }

    const distanceDiff =
      getDistanceScore(left, livePriceMicros) - getDistanceScore(right, livePriceMicros);
    if (distanceDiff !== 0n) {
      return distanceDiff < 0n ? -1 : 1;
    }

    if (left.tradingDay !== right.tradingDay) {
      return right.tradingDay - left.tradingDay;
    }

    if (left.strikePriceMicros !== right.strikePriceMicros) {
      return left.strikePriceMicros < right.strikePriceMicros ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });
}

export function buildStockOverviews(
  markets: readonly MarketSummary[],
  snapshots: Partial<Record<MeridianTicker, TickerSnapshot>>,
  quotes: MarketQuoteMap,
): StockOverview[] {
  return MERIDIAN_TICKERS.map((ticker) => {
    const stockMarkets = markets.filter((market) => market.ticker === ticker);
    const activeContracts = stockMarkets.filter(
      (market) => market.phase === "Trading",
    ).length;
    const livePriceMicros = snapshots[ticker]?.priceMicros ?? null;
    const featuredMarket =
      sortMarketsForTicker(stockMarkets, livePriceMicros).find(
        (market) => market.phase === "Trading",
      ) ??
      sortMarketsForTicker(stockMarkets, livePriceMicros)[0] ??
      null;

    return {
      ticker,
      livePriceMicros,
      activeContracts,
      totalContracts: stockMarkets.length,
      featuredMarket,
      featuredQuote: featuredMarket ? quotes[featuredMarket.id] ?? null : null,
    };
  });
}

export function getTopContracts(
  markets: readonly MarketSummary[],
  count: number,
): MarketSummary[] {
  return [...markets]
    .filter((market) => market.phase === "Trading")
    .sort((left, right) => {
      if (left.yesOpenInterest !== right.yesOpenInterest) {
        return left.yesOpenInterest > right.yesOpenInterest ? -1 : 1;
      }

      if (left.tradingDay !== right.tradingDay) {
        return right.tradingDay - left.tradingDay;
      }

      return left.id.localeCompare(right.id);
    })
    .slice(0, count);
}
