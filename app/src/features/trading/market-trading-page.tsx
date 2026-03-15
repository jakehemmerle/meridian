"use client";

import { useCallback, useState } from "react";
import type { MarketSummary } from "../markets/model";
import type { TradeIntent } from "./model";
import { TradingScreen } from "./trading-screen";
import { useOrderBook } from "./use-orderbook";
import { useTrade } from "./use-trade";
import { useBalances } from "./use-balances";

interface MarketTradingPageProps {
  market: MarketSummary;
  onBack: () => void;
}

export function MarketTradingPage({ market, onBack }: MarketTradingPageProps) {
  const { yesLadder, noLadder } = useOrderBook(
    market.phoenixMarket.toBase58(),
  );

  const { executeIntent, redeem } = useTrade(market);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { balances, position } = useBalances(
    market.yesMint,
    market.noMint,
    refreshTrigger,
  );

  const [executing, setExecuting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const handleExecute = useCallback(
    async (intent: TradeIntent, quantity: number) => {
      setExecuting(true);
      setLastError(null);
      try {
        await executeIntent(intent, quantity);
        setRefreshTrigger((n) => n + 1);
      } catch (err: any) {
        setLastError(err?.message ?? "Transaction failed");
        throw err;
      } finally {
        setExecuting(false);
      }
    },
    [executeIntent],
  );

  const handleRedeem = useCallback(
    async (quantity: number) => {
      setExecuting(true);
      setLastError(null);
      try {
        await redeem(quantity);
        setRefreshTrigger((n) => n + 1);
      } catch (err: any) {
        setLastError(err?.message ?? "Redemption failed");
      } finally {
        setExecuting(false);
      }
    },
    [redeem],
  );

  return (
    <div className="shell">
      <TradingScreen
        ticker={market.ticker}
        strikePriceMicros={Number(market.strikePriceMicros)}
        yesLadder={yesLadder}
        noLadder={noLadder}
        marketCloseUtc={market.closeTimeTs}
        position={position}
        onIntent={() => {}}
        onExecute={handleExecute}
        usdcBalance={balances?.usdc ?? null}
        executing={executing}
        lastError={lastError}
        phase={market.phase}
        outcome={market.outcome}
        onRedeem={handleRedeem}
        onBack={onBack}
      />
    </div>
  );
}
