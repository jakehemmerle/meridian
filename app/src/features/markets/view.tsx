"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

import type { MarketSummary } from "./model";
import { formatMarketKey } from "./model";
import { useMarketList } from "./use-market-list";

import { PageShell } from "../../components/page-shell";
import { formatUsdBigint } from "../../lib/format";

interface MarketDiscoveryListProps {
  markets: MarketSummary[];
  loading: boolean;
}

export function MarketDiscoveryList({ markets, loading }: MarketDiscoveryListProps) {
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

  // Group markets by ticker
  const grouped = new Map<string, MarketSummary[]>();
  for (const market of markets) {
    const existing = grouped.get(market.ticker) ?? [];
    existing.push(market);
    grouped.set(market.ticker, existing);
  }

  return (
    <section className="panel">
      <h2>Markets</h2>
      {Array.from(grouped.entries()).map(([ticker, tickerMarkets]) => (
        <div key={ticker}>
          <h3>{ticker}</h3>
          <ul>
            {tickerMarkets.map((market) => (
              <li key={formatMarketKey(market)} data-testid={`market-item-${market.ticker}`}>
                <Link href={`/trade/${market.id}`}>
                  <span>{market.ticker}</span>
                  <span>Strike: {formatUsdBigint(market.strikePriceMicros)}</span>
                  <span className={`phase-badge phase-${market.phase.toLowerCase()}`}>
                    {market.phase}
                  </span>
                  {market.outcome !== "Unsettled" && (
                    <span>{market.outcome}</span>
                  )}
                  {market.yesPriceMicros !== null && (
                    <span>Yes: {formatUsdBigint(market.yesPriceMicros)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function MarketsLandingPage() {
  const { connected, connect } = useWallet();
  const { markets, loading } = useMarketList();

  return (
    <PageShell
      hero={
        <section className="hero">
          <p className="eyebrow">Meridian</p>
          <h1>Binary outcome markets on Solana.</h1>
          <p className="lede">
            Will [STOCK] close above [STRIKE] today? Yes pays $1.00. No pays $0.00.
          </p>
        </section>
      }
    >
      {!connected && (
        <section className="panel">
          <button type="button" onClick={() => connect()}>
            Connect Wallet
          </button>
        </section>
      )}

      <MarketDiscoveryList markets={markets} loading={loading} />
    </PageShell>
  );
}
