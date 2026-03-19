"use client";

import Link from "next/link";
import { Card, Flex, Heading, Tabs, Text } from "@radix-ui/themes";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "../../components/wallet-button";
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
  const hero = (
    <Card className="hero-card">
      <Text size="1" color="gray">
        PORTFOLIO
      </Text>
      <h1 className="page-title">Wallet inventory and claims</h1>
      <p className="page-copy">
        Active Yes/No positions, settled outcomes, and redeemable claims tied to
        the connected wallet.
      </p>
    </Card>
  );

  if (!connected) {
    return (
      <PageShell hero={hero}>
        <Card>
          <p className="page-copy">Connect your wallet to view positions.</p>
          <WalletButton />
        </Card>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell hero={hero}>
        <Card>
          <p className="page-copy">Loading positions...</p>
        </Card>
      </PageShell>
    );
  }

  const settledMarkets = markets.filter((m) => m.phase === "Settled");
  const settledPositions = positions.filter((pos) =>
    settledMarkets.some((m) => m.id === pos.marketId),
  );
  const activePositions = positions.filter((pos) =>
    !settledMarkets.some((m) => m.id === pos.marketId),
  );

  return (
    <PageShell hero={hero}>
      <Card>
        <Tabs.Root defaultValue="active">
          <Tabs.List>
            <Tabs.Trigger value="active">Active</Tabs.Trigger>
            <Tabs.Trigger value="settled">Settled</Tabs.Trigger>
            <Tabs.Trigger value="redeemable">Redeemable</Tabs.Trigger>
          </Tabs.List>

          <div className="phase-tabs">
            <Tabs.Content value="active">
              <PortfolioPositionList positions={activePositions} />
            </Tabs.Content>
            <Tabs.Content value="settled">
              <PortfolioPositionList positions={settledPositions} />
            </Tabs.Content>
            <Tabs.Content value="redeemable">
              {settledPositions.length > 0 ? (
                <Flex direction="column" gap="4">
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
                </Flex>
              ) : (
                <Card>
                  <Text size="2" color="gray">
                    No settled winning claims are ready to redeem.
                  </Text>
                </Card>
              )}
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </Card>

      {positions.length > 0 && (
        <Card>
          <Flex direction="column" gap="3">
            <div>
              <Text size="1" color="gray">
                SHORTCUTS
              </Text>
              <Heading as="h2" size="5">
                Jump back into a market
              </Heading>
            </div>
            <Flex gap="3" wrap="wrap">
              {positions.map((pos) => (
                <Link key={`${pos.marketId}-${pos.side}`} href={`/trade/${pos.marketId}`}>
                  {pos.ticker} {pos.side === "yes" ? "Yes" : "No"}
                </Link>
              ))}
            </Flex>
          </Flex>
        </Card>
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
