"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Text } from "@radix-ui/themes";
import { useWallet } from "@solana/wallet-adapter-react";

import { WalletButton } from "../../../components/wallet-button";
import { PageShell } from "../../../components/page-shell";
import { useMarketAccount } from "../../../lib/solana/use-market-account";
import type { MarketSummary } from "../../../features/markets/model";
import { MarketTradingPage } from "../../../features/trading/market-trading-page";

const MERIDIAN_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];

export default function TradePage() {
  const params = useParams<{ market: string }>();
  const router = useRouter();
  const { connected } = useWallet();
  const marketData = useMarketAccount(params.market);

  const market = useMemo<MarketSummary | null>(() => {
    if (!marketData) return null;

    return {
      id: marketData.marketPda.toBase58(),
      pda: marketData.marketPda,
      ticker: MERIDIAN_TICKERS[marketData.ticker] ?? "UNKNOWN",
      strikePriceMicros: marketData.strikePrice,
      tradingDay: marketData.tradingDay,
      yesPriceMicros: null,
      closeTimeTs: marketData.closeTimeTs,
      phase: marketData.phase,
      outcome: marketData.outcome,
      phoenixMarket: marketData.phoenixMarket,
      yesMint: marketData.yesMint,
      noMint: marketData.noMint,
      vault: marketData.vaultPda,
      settledPrice: null,
      settlementTs: null,
      yesOpenInterest: 0n,
    };
  }, [marketData]);

  if (!connected) {
    return (
      <PageShell
        hero={
          <Card className="hero-card">
            <Text size="1" color="gray">
              TRADE
            </Text>
            <h1 className="page-title">Connect to trade</h1>
            <p className="page-copy">
              Open the selected market and trade on devnet after connecting a wallet.
            </p>
          </Card>
        }
      >
        <Card>
          <p className="page-copy">Connect your wallet to trade.</p>
          <WalletButton />
        </Card>
      </PageShell>
    );
  }

  if (!market) {
    return (
      <PageShell
        hero={
          <Card className="hero-card">
            <Text size="1" color="gray">
              TRADE
            </Text>
            <h1 className="page-title">Loading market</h1>
            <p className="page-copy">Loading market data...</p>
          </Card>
        }
      >
        <Card>
          <p className="page-copy">Loading market data...</p>
        </Card>
      </PageShell>
    );
  }

  return <MarketTradingPage market={market} onBack={() => router.push("/")} />;
}
