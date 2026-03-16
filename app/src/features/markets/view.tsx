"use client";

import { useWallet } from "@solana/wallet-adapter-react";

import type { MarketSummary } from "./model";
import { formatMarketKey } from "./model";
import { useMarkets } from "./use-markets";
import { formatMicros } from "../../lib/format";

import { PageShell } from "../../components/page-shell";
import { WalletButton } from "../../components/wallet-button";

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
    <section className="panel">
      <h2>Markets</h2>
      <ul>
        {markets.map((market) => (
          <li
            key={formatMarketKey(market)}
            className={onSelect ? "market-row" : undefined}
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
            <span>
              <strong>{market.ticker}</strong>
            </span>
            <span>Strike: {formatMicros(market.strikePriceMicros)}</span>
            <span>Day: {market.tradingDay}</span>
            <span className="market-phase">{market.phase}</span>
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
  const { markets, loading, refresh } = useMarkets();

  return (
    <PageShell
      hero={
        <section className="hero">
          <p className="eyebrow">Meridian</p>
          <h1>Binary outcome markets on Solana.</h1>
          <p className="lede">
            Will [STOCK] close above [STRIKE] today? Yes pays $1.00. No pays
            $0.00.
          </p>
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" onClick={refresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <MarketDiscoveryList
            markets={markets}
            loading={loading}
            onSelect={onSelectMarket}
          />
        </>
      )}
    </PageShell>
  );
}
