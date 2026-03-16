"use client";

import { useWallet } from "@solana/wallet-adapter-react";

import type { MarketSummary } from "./model";
import { formatMarketKey } from "./model";
import { formatMicros } from "../../lib/format";

import { PageShell } from "../../components/page-shell";
import { WalletButton } from "../../components/wallet-button";
import { useMarketList } from "./use-market-list";
import { useMarkets } from "./use-markets";

function formatTradingDay(tradingDay: number): string {
  const value = String(tradingDay);
  if (value.length !== 8) return String(tradingDay);

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface MarketDiscoveryListProps {
  markets: MarketSummary[];
  loading: boolean;
  onSelect?: (market: MarketSummary) => void;
}

export function MarketDiscoveryList({
  markets,
  loading,
  onSelect,
}: MarketDiscoveryListProps) {
  if (loading) {
    return (
      <section className="panel">
        <h2>Markets</h2>
        <p>Loading markets...</p>
      </section>
    );
  }

  if (markets.length === 0) {
    return (
      <section className="panel">
        <h2>Markets</h2>
        <p>No markets available.</p>
      </section>
    );
  }

  return (
    <section className="panel market-panel">
      <div className="market-panel-head">
        <div>
          <p className="eyebrow">Live Markets</p>
          <h2>Pick A Contract</h2>
        </div>
      </div>
      <ul className="market-card-list">
        {markets.map((market) => (
          <li
            key={formatMarketKey(market)}
            className={onSelect ? "market-row market-card" : "market-card"}
            onClick={() => onSelect?.(market)}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={(e) => {
              if (onSelect && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(market);
              }
            }}
          >
            <div className="market-card-head">
              <span className="market-phase">{market.phase}</span>
              <span className="market-day">{formatTradingDay(market.tradingDay)}</span>
            </div>
            <p className="market-question">
              Will {market.ticker} close above {formatMicros(market.strikePriceMicros)} today?
            </p>
            <div className="market-card-meta">
              <span>Strike {formatMicros(market.strikePriceMicros)}</span>
              <span>Closes 4:00 PM ET</span>
            </div>
            <span className="market-card-cta">
              {onSelect ? "Open Market" : "Connect Wallet To Trade"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface MarketsLandingPageProps {
  onSelectMarket?: (market: MarketSummary) => void;
}

export function MarketsLandingPage({ onSelectMarket }: MarketsLandingPageProps) {
  const { connected } = useWallet();
  const { markets: publicMarkets } = useMarketList();
  const {
    markets: connectedMarkets,
    loading: connectedLoading,
    refresh,
  } = useMarkets();
  const publicTradeableMarkets = publicMarkets
    .filter((market) => market.phase === "Trading" && market.yesOpenInterest > 0n)
    .sort((a, b) => {
      if (a.tradingDay !== b.tradingDay) return b.tradingDay - a.tradingDay;
      if (a.strikePriceMicros !== b.strikePriceMicros) {
        return a.strikePriceMicros < b.strikePriceMicros ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    });
  const connectedTradeableMarkets = connectedMarkets;
  const featuredMarket =
    publicTradeableMarkets[0] ?? connectedTradeableMarkets[0] ?? null;
  const displayMarkets =
    connectedTradeableMarkets.length > 0
      ? connectedTradeableMarkets
      : publicTradeableMarkets;
  const loading = connected && connectedLoading && displayMarkets.length === 0;

  return (
    <PageShell
      hero={
        <section className="hero">
          <p className="eyebrow">Meridian</p>
          <h1>
            {featuredMarket
              ? `Will ${featuredMarket.ticker} close above ${formatMicros(featuredMarket.strikePriceMicros)} today?`
              : "Binary outcome markets on Solana."}
          </h1>
          <p className="lede">
            {featuredMarket
              ? `Yes settles to $1.00 if ${featuredMarket.ticker} closes above the strike at the close. No settles to $1.00 if it does not.`
              : "Trade a live binary market on whether a stock will finish above its strike at the close. Yes settles to $1.00 if it clears the strike; No settles to $1.00 if it does not."}
          </p>
          <div className="heroSummary">
            <div className="heroMetric">
              <p>Settlement</p>
              <strong>$1.00 binary payout</strong>
            </div>
            <div className="heroMetric">
              <p>Venue</p>
              <strong>Phoenix order book</strong>
            </div>
            <div className="heroMetric">
              <p>Network</p>
              <strong>Solana devnet</strong>
            </div>
          </div>
        </section>
      }
    >
      {!connected && (
        <section className="panel">
          <p>Connect your wallet to discover markets.</p>
          <WalletButton />
        </section>
      )}

      {connected && (
        <>
          <div className="panelActionRow">
            <button
              type="button"
              className="panelActionButton"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? "Refreshing Markets..." : "Refresh Market List"}
            </button>
          </div>
          <MarketDiscoveryList
            markets={displayMarkets}
            loading={loading}
            onSelect={onSelectMarket}
          />
        </>
      )}
    </PageShell>
  );
}
