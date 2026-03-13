import {
  DEFAULT_PUBLIC_SOLANA_CLUSTER,
  DEVNET_USDC_MINT,
  MERIDIAN_PROGRAM_ID,
} from "@meridian/domain";

import type { MarketSummary } from "./model";
import { formatMarketKey } from "./model";

import { PageShell } from "../../components/page-shell";
import { readPublicMeridianEnv } from "../../lib/env/public";

import { PortfolioOverviewPanel } from "../portfolio/view";
import { TradingOverviewPanel } from "../trading/view";
import { WalletStatusPanel } from "../wallet/view";

const stack = [
  { label: "Chain", value: "Solana devnet" },
  { label: "Program", value: "Anchor 0.32.1" },
  { label: "Order Book", value: "Phoenix DEX" },
  { label: "Oracle", value: "Pyth pull feeds" },
];

const commands = [
  "pnpm build",
  "pnpm test",
  "pnpm dev:web",
  "pnpm dev:automation",
  "pnpm deploy:devnet",
];

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
          <li key={formatMarketKey(market)}>
            <span>{market.ticker}</span>
            <span>Strike: {formatMicros(market.strikePriceMicros)}</span>
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
  const env = readPublicMeridianEnv();
  const envSummary = [
    ["Cluster", env.cluster || DEFAULT_PUBLIC_SOLANA_CLUSTER],
    ["Program", env.programId || MERIDIAN_PROGRAM_ID],
    ["USDC", env.usdcMint || DEVNET_USDC_MINT],
  ];

  return (
    <PageShell
      hero={
        <section className="hero">
          <p className="eyebrow">Meridian Workspace</p>
          <h1>One repo for the program, trading UI, and lifecycle automation.</h1>
          <p className="lede">
            This frontend shell now keeps route files narrow while feature modules own wallet,
            markets, trading, and portfolio presentation.
          </p>
          <div className="heroSummary">
            {envSummary.map(([label, value]) => (
              <article key={label} className="heroMetric">
                <p>{label}</p>
                <code>{value}</code>
              </article>
            ))}
          </div>
        </section>
      }
    >
      <section className="grid">
        <section className="panel">
          <h2>Markets Surface</h2>
          <p className="sectionCopy">
            The landing route is now a composition shell. Market-facing copy, status, and future
            discovery UI can expand here without crowding Next.js route files.
          </p>
          <ul>
            {stack.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Operator Commands</h2>
          <p className="sectionCopy">
            Build, test, local app startup, and automation startup remain workspace-level concerns.
          </p>
          <ul>
            {commands.map((command) => (
              <li key={command}>
                <code>{command}</code>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="grid">
        <WalletStatusPanel />
        <TradingOverviewPanel />
      </section>

      <PortfolioOverviewPanel />
    </PageShell>
  );
}
