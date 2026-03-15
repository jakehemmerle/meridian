"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PortfolioPositionList, RedeemPanel } from "../../features/portfolio";
import { usePortfolioPositions } from "../../features/portfolio/use-portfolio";
import { useMarketList } from "../../features/markets/use-market-list";
import { useRedeem, type RedeemMarketAccounts } from "../../features/portfolio/use-redeem";
import { useMarketAccount } from "../../lib/solana/use-market-account";
import { getUsdcMint } from "../../lib/usdc-mint";
import { PageShell } from "../../components/page-shell";
import type { MarketOutcome } from "../../features/markets/model";

export default function PortfolioPage() {
  const { connected } = useWallet();
  const { positions, loading } = usePortfolioPositions();
  const { markets } = useMarketList();

  if (!connected) {
    return (
      <PageShell hero={<h1>Portfolio</h1>}>
        <section className="panel">
          <p>Connect your wallet to view positions.</p>
          <WalletMultiButton />
        </section>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell hero={<h1>Portfolio</h1>}>
        <section className="panel">
          <p>Loading positions...</p>
        </section>
      </PageShell>
    );
  }

  // Build market lookup for settled markets
  const settledMarkets = markets.filter((m) => m.phase === "Settled");
  const settledPositions = positions.filter((pos) =>
    settledMarkets.some((m) => m.id === pos.marketId),
  );

  return (
    <PageShell hero={<h1>Portfolio</h1>}>
      <PortfolioPositionList positions={positions} />

      {settledPositions.length > 0 && (
        <section className="panel">
          <h2>Redeem Settled Positions</h2>
          {settledPositions.map((pos) => {
            const market = settledMarkets.find((m) => m.id === pos.marketId);
            if (!market) return null;
            return (
              <SettledPositionRedeem
                key={`${pos.marketId}-${pos.side}`}
                marketId={pos.marketId}
                side={pos.side}
                quantity={pos.quantity}
                marketOutcome={market.outcome}
              />
            );
          })}
        </section>
      )}

      {positions.length > 0 && (
        <section className="panel">
          {positions.map((pos) => (
            <Link key={`${pos.marketId}-${pos.side}`} href={`/trade/${pos.marketId}`}>
              View {pos.ticker} market
            </Link>
          ))}
        </section>
      )}
    </PageShell>
  );
}

function SettledPositionRedeem({
  marketId,
  side,
  quantity,
  marketOutcome,
}: {
  marketId: string;
  side: "yes" | "no";
  quantity: bigint;
  marketOutcome: MarketOutcome;
}) {
  const marketData = useMarketAccount(marketId);
  const usdcMint = getUsdcMint();

  const redeemAccounts: RedeemMarketAccounts | null = marketData
    ? {
        marketPda: marketData.marketPda,
        configPda: marketData.configPda,
        vaultPda: marketData.vaultPda,
        yesMint: marketData.yesMint,
        noMint: marketData.noMint,
        usdcMint,
      }
    : null;

  const { redeem, status } = useRedeem(redeemAccounts);

  if (!marketData) return <p>Loading market...</p>;

  return (
    <RedeemPanel
      marketPhase="Settled"
      marketOutcome={marketOutcome}
      userSide={side}
      quantity={quantity}
      pending={status === "signing" || status === "confirming"}
      onRedeem={(qty) => {
        redeem(qty).catch(() => {});
      }}
    />
  );
}
