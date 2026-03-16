"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
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
          <section className="pageHero">
            <h1>Trade</h1>
            <p>Connect your wallet to open the selected market and trade on devnet.</p>
          </section>
        }
      >
        <section className="panel">
          <p>Connect your wallet to trade.</p>
          <WalletButton />
        </section>
      </PageShell>
    );
  }

  if (!market) {
    return (
      <PageShell
        hero={
          <section className="pageHero">
            <h1>Trade</h1>
            <p>Loading market data...</p>
          </section>
        }
      >
        <section className="panel">
          <p>Loading market data...</p>
        </section>
      </PageShell>
    );
  }

  return <MarketTradingPage market={market} onBack={() => router.push("/")} />;
}
