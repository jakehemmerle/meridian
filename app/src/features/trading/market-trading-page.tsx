"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Badge, Card, Flex, Text } from "@radix-ui/themes";
import type { MarketSummary } from "../markets/model";
import type { TradeIntent } from "./model";
import { TradingScreen } from "./trading-screen";
import { useOrderBook } from "./use-orderbook";
import { useTrade } from "./use-trade";
import { useBalances } from "./use-balances";
import { TransactionToast } from "./transaction-toast";
import { sortMarketsForTicker } from "../markets/selectors";
import { useMarketList } from "../markets/use-market-list";
import { useTickerSnapshots, getTickerSnapshot } from "../markets/use-ticker-snapshots";

interface MarketTradingPageProps {
  market: MarketSummary;
  onBack: () => void;
}

export function MarketTradingPage({ market, onBack }: MarketTradingPageProps) {
  const { yesLadder, noLadder } = useOrderBook(
    market.phoenixMarket.toBase58(),
  );

  const { markets } = useMarketList();
  const { snapshots } = useTickerSnapshots();
  const { executeIntent, redeem } = useTrade(market);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { balances, position } = useBalances(
    market.yesMint,
    market.noMint,
    refreshTrigger,
  );

  const [executing, setExecuting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<
    "idle" | "submitting" | "confirmed" | "error"
  >("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const [toastTitle, setToastTitle] = useState("");
  const [toastDescription, setToastDescription] = useState("");

  const siblingMarkets = useMemo(() => {
    const snapshot = getTickerSnapshot(snapshots, market.ticker);
    return sortMarketsForTicker(
      markets.filter((candidate) => candidate.ticker === market.ticker),
      snapshot?.priceMicros ?? null,
    );
  }, [market.ticker, markets, snapshots]);

  const handleExecute = useCallback(
    async (intent: TradeIntent, quantity: number) => {
      setExecuting(true);
      setLastError(null);
      setTxStatus("submitting");
      setTxSignature(null);
      try {
        const signature = await executeIntent(intent, quantity);
        setTxSignature(signature);
        setTxStatus("confirmed");
        setToastTone("success");
        setToastTitle("Trade confirmed");
        setToastDescription(
          `${intent.replace("-", " ")} executed for ${quantity} contract${quantity === 1 ? "" : "s"}.`,
        );
        setToastOpen(true);
        setRefreshTrigger((n) => n + 1);
      } catch (err: any) {
        setLastError(err?.message ?? "Transaction failed");
        setTxStatus("error");
        setTxSignature(null);
        setToastTone("error");
        setToastTitle("Trade failed");
        setToastDescription(err?.message ?? "Transaction failed");
        setToastOpen(true);
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
      setTxStatus("submitting");
      setTxSignature(null);
      try {
        const signature = await redeem(quantity);
        setTxSignature(signature);
        setTxStatus("confirmed");
        setToastTone("success");
        setToastTitle("Redemption confirmed");
        setToastDescription(
          `Redeemed ${quantity} winning contract${quantity === 1 ? "" : "s"}.`,
        );
        setToastOpen(true);
        setRefreshTrigger((n) => n + 1);
      } catch (err: any) {
        setLastError(err?.message ?? "Redemption failed");
        setTxStatus("error");
        setTxSignature(null);
        setToastTone("error");
        setToastTitle("Redemption failed");
        setToastDescription(err?.message ?? "Redemption failed");
        setToastOpen(true);
      } finally {
        setExecuting(false);
      }
    },
    [redeem],
  );

  return (
    <div className="trade-page">
      <Card>
        <Flex justify="between" align="center" gap="4" wrap="wrap">
          <div>
            <Text size="1" color="gray">
              STRIKE NAVIGATOR
            </Text>
            <Text size="2" color="gray">
              Switch to another {market.ticker} strike without leaving the trading flow.
            </Text>
          </div>
          <div className="sibling-market-row">
            {siblingMarkets.map((candidate) => (
              <Link
                key={candidate.id}
                href={`/trade/${candidate.id}`}
                className={candidate.id === market.id ? "sibling-link active" : "sibling-link"}
              >
                <Badge
                  color={candidate.id === market.id ? "teal" : "gray"}
                  variant={candidate.id === market.id ? "solid" : "soft"}
                >
                  {candidate.ticker} {Number(candidate.strikePriceMicros) / 1_000_000}
                </Badge>
              </Link>
            ))}
          </div>
        </Flex>
      </Card>

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
        txStatus={txStatus}
        txSignature={txSignature}
      />
      <TransactionToast
        open={toastOpen}
        onOpenChange={setToastOpen}
        title={toastTitle}
        description={toastDescription}
        tone={toastTone}
        signature={txSignature}
      />
    </div>
  );
}
