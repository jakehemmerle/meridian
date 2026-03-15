"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { MERIDIAN_TICKERS } from "@meridian/domain";

import type { MarketSummary } from "./model";
import { formatMarketKey } from "./model";
import { useMarketList } from "./use-market-list";

import { PageShell } from "../../components/page-shell";

function formatMicros(micros: bigint): string {
  const dollars = Number(micros) / 1_000_000;
  return `$${dollars.toFixed(2)}`;
}

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

  return (
    <section className="panel">
      <h2>Markets</h2>
      <ul>
        {markets.map((market) => (
          <li key={formatMarketKey(market)} data-testid={`market-item-${market.ticker}`}>
            <span>{market.ticker}</span>
            <span>Strike: {formatMicros(market.strikePriceMicros)}</span>
            <span>{market.phase}</span>
            {market.outcome !== "Unsettled" && (
              <span>{market.outcome}</span>
            )}
            {market.yesPriceMicros !== null && (
              <span>Yes: {formatMicros(market.yesPriceMicros)}</span>
            )}
          </li>
        ))}
      </ul>
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
      <section className="grid">
        <section className="panel">
          <h2>MAG7 Tickers</h2>
          <ul>
            {MERIDIAN_TICKERS.map((ticker) => (
              <li key={ticker}>
                <span>{ticker}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>

      {!connected && (
        <section className="panel">
          <p>Loading markets...</p>
          <button type="button" onClick={() => connect()}>
            Connect Wallet
          </button>
        </section>
      )}

      {connected && (
        <MarketDiscoveryList markets={markets} loading={loading} />
      )}
    </PageShell>
  );
}
