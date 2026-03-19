"use client";

import { useState } from "react";
import type { OrderBookLadder } from "@meridian/domain";
import { Badge, Button, Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { ArrowLeftIcon } from "@radix-ui/react-icons";

import {
  type TradeIntent,
  type UserPosition,
  computePayoff,
  getCountdownSeconds,
  getPositionConstraints,
} from "./model";
import { formatUsd } from "../../lib/format";

interface TradingScreenProps {
  ticker: string;
  strikePriceMicros: number;
  yesLadder: OrderBookLadder | null;
  noLadder: OrderBookLadder | null;
  marketCloseUtc: number;
  position: UserPosition | null;
  onIntent: (intent: TradeIntent) => void;
  onExecute?: (intent: TradeIntent, quantity: number) => Promise<void>;
  usdcBalance?: bigint | null;
  executing?: boolean;
  lastError?: string | null;
  phase?: "Trading" | "Closed" | "Settled";
  outcome?: "Unsettled" | "Yes" | "No";
  onRedeem?: (quantity: number) => Promise<void>;
  onBack?: () => void;
  txStatus?: "idle" | "submitting" | "confirmed" | "error";
  txSignature?: string | null;
}

type TradeDirection = "buy" | "sell";
type TradeOutcome = "yes" | "no";

function formatPrice(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

function formatTokens(raw: bigint): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTradingAction(intent: TradeIntent): string {
  switch (intent) {
    case "buy-yes":
      return "Buy Yes";
    case "buy-no":
      return "Buy No";
    case "sell-yes":
      return "Sell Yes";
    case "sell-no":
      return "Sell No";
  }
}

function formatMicrosTotal(micros: number): string {
  return formatUsd(micros);
}

function getIntentForSelection(
  direction: TradeDirection,
  outcome: TradeOutcome,
): TradeIntent {
  if (direction === "buy" && outcome === "yes") return "buy-yes";
  if (direction === "buy" && outcome === "no") return "buy-no";
  if (direction === "sell" && outcome === "yes") return "sell-yes";
  return "sell-no";
}

function getGuidanceForIntent(
  intent: TradeIntent,
  constraints: ReturnType<typeof getPositionConstraints>,
): string | null {
  switch (intent) {
    case "buy-yes":
      return constraints.buyYesGuidance;
    case "buy-no":
      return constraints.buyNoGuidance;
    case "sell-yes":
      return constraints.sellYesGuidance;
    case "sell-no":
      return constraints.sellNoGuidance;
  }
}

function getIntentDisabled(
  intent: TradeIntent,
  constraints: ReturnType<typeof getPositionConstraints>,
): boolean {
  switch (intent) {
    case "buy-yes":
      return !constraints.canBuyYes;
    case "buy-no":
      return !constraints.canBuyNo;
    case "sell-yes":
      return !constraints.canSellYes;
    case "sell-no":
      return !constraints.canSellNo;
  }
}

function formatSpread(
  bestBidMicros: number | null,
  bestAskMicros: number | null,
): string {
  if (bestBidMicros == null || bestAskMicros == null) return "No spread";
  return formatPrice(bestAskMicros - bestBidMicros);
}

function SideQuoteCard({
  label,
  ladder,
  active,
}: {
  label: string;
  ladder: OrderBookLadder | null;
  active: boolean;
}) {
  const bestBid = ladder?.bids[0]?.priceMicros ?? null;
  const bestAsk = ladder?.asks[0]?.priceMicros ?? null;

  return (
    <Card className={active ? "quote-card-surface quote-card-active" : "quote-card-surface"}>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Heading as="h3" size="4">
            {label}
          </Heading>
          {active && (
            <Badge color="teal" variant="soft">
              Selected
            </Badge>
          )}
        </Flex>
        <div className="quote-grid">
          <div className="quote-stat">
            <Text size="1" color="gray">
              Best bid
            </Text>
            <Text className="metric-mono">{bestBid == null ? "No bid" : formatPrice(bestBid)}</Text>
          </div>
          <div className="quote-stat">
            <Text size="1" color="gray">
              Best ask
            </Text>
            <Text className="metric-mono">{bestAsk == null ? "No ask" : formatPrice(bestAsk)}</Text>
          </div>
        </div>
      </Flex>
    </Card>
  );
}

interface MergedRow {
  price: number;
  bidSize: number | null;
  askSize: number | null;
}

function mergeLevels(ladder: OrderBookLadder): MergedRow[] {
  const priceMap = new Map<number, MergedRow>();

  for (const level of ladder.bids) {
    const existing = priceMap.get(level.priceMicros);
    if (existing) {
      existing.bidSize = level.sizeLots;
    } else {
      priceMap.set(level.priceMicros, {
        price: level.priceMicros,
        bidSize: level.sizeLots,
        askSize: null,
      });
    }
  }

  for (const level of ladder.asks) {
    const existing = priceMap.get(level.priceMicros);
    if (existing) {
      existing.askSize = level.sizeLots;
    } else {
      priceMap.set(level.priceMicros, {
        price: level.priceMicros,
        bidSize: null,
        askSize: level.sizeLots,
      });
    }
  }

  return Array.from(priceMap.values()).sort((a, b) => b.price - a.price);
}

function LadderView({
  label,
  ladder,
  active,
}: {
  label: string;
  ladder: OrderBookLadder | null;
  active: boolean;
}) {
  const rows = ladder ? mergeLevels(ladder).slice(0, 6) : [];
  const bestBid = ladder?.bids[0]?.priceMicros ?? null;
  const bestAsk = ladder?.asks[0]?.priceMicros ?? null;

  return (
    <Card className={active ? "ladder-surface ladder-active" : "ladder-surface"}>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <Heading as="h3" size="4">
            {label}
          </Heading>
          <Text size="2" color="gray">
            {bestBid == null ? "No bid" : `Bid ${formatPrice(bestBid)}`} /{" "}
            {bestAsk == null ? "No ask" : `Ask ${formatPrice(bestAsk)}`}
          </Text>
        </Flex>
        {rows.length === 0 ? (
          <Text size="2" color="gray">
            {ladder == null ? "Loading live quotes..." : "No resting orders yet."}
          </Text>
        ) : (
          <div className="orderbook-table-wrap">
            <table className="orderbook-table">
              <thead>
                <tr>
                  <th>Bid</th>
                  <th>Price</th>
                  <th>Ask</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${label}-${row.price}-${index}`}>
                    <td className="book-bid">{row.bidSize ?? ""}</td>
                    <td className="metric-mono">{formatPrice(row.price)}</td>
                    <td className="book-ask">{row.askSize ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Flex>
    </Card>
  );
}

export function TradingScreen({
  ticker,
  strikePriceMicros,
  yesLadder,
  noLadder,
  marketCloseUtc,
  position,
  onIntent,
  onExecute,
  usdcBalance,
  executing,
  lastError,
  phase,
  outcome,
  onRedeem,
  onBack,
  txStatus = "idle",
  txSignature,
}: TradingScreenProps) {
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>("buy");
  const [selectedOutcome, setSelectedOutcome] = useState<TradeOutcome>("yes");
  const [quantity, setQuantity] = useState(1);
  const constraints = getPositionConstraints(position);
  const nowUtc = Math.floor(Date.now() / 1000);
  const countdown = getCountdownSeconds(marketCloseUtc, nowUtc);
  const isClosed = countdown <= 0;
  const isSettled = phase === "Settled";
  const selectedIntent = getIntentForSelection(tradeDirection, selectedOutcome);
  const selectedLadder = selectedOutcome === "yes" ? yesLadder : noLadder;
  const selectedBestBid = selectedLadder?.bids[0]?.priceMicros ?? null;
  const selectedBestAsk = selectedLadder?.asks[0]?.priceMicros ?? null;
  const selectedExecutionPrice =
    tradeDirection === "buy" ? selectedBestAsk : selectedBestBid;
  const selectedTotalMicros =
    selectedExecutionPrice == null ? null : selectedExecutionPrice * quantity;
  const settlementValueMicros = 1_000_000 * quantity;
  const selectedGuidance = isClosed
    ? "This market is closed."
    : getGuidanceForIntent(selectedIntent, constraints);
  const selectedDisabled = getIntentDisabled(selectedIntent, constraints);
  const payoff =
    selectedExecutionPrice != null
      ? computePayoff(selectedIntent, selectedExecutionPrice)
      : null;

  const showLiquidityMessage =
    !isSettled && selectedExecutionPrice == null && !selectedGuidance;

  const hasWinningTokens =
    isSettled &&
    position &&
    ((outcome === "Yes" && position.yesQuantity > 0n) ||
      (outcome === "No" && position.noQuantity > 0n));

  async function handleIntentClick() {
    if (onExecute) {
      try {
        await onExecute(selectedIntent, quantity);
      } catch {
        // parent handles error state
      }
    } else {
      onIntent(selectedIntent);
    }
  }

  return (
    <div className="trade-screen">
      <Card className="hero-card">
        <Flex direction="column" gap="4">
          <Flex justify="between" align="start" gap="4" wrap="wrap">
            <div>
              {onBack && (
                <button type="button" className="back-link-button" onClick={onBack}>
                  <ArrowLeftIcon />
                  Markets
                </button>
              )}
              <Text size="1" color="gray">
                {ticker} DAILY MARKET
              </Text>
              <Heading as="h1" size="8" className="trade-heading">
                Will {ticker} close above {formatPrice(strikePriceMicros)} today?
              </Heading>
              <Text size="3" color="gray" className="trade-subcopy">
                Yes settles to $1.00 if {ticker} finishes above the strike at the
                close. No settles to $1.00 if it does not.
              </Text>
            </div>

            <span
              data-testid="countdown-timer"
              className={`phase-pill ${isSettled ? "settled" : isClosed ? "closed" : "live"}`}
            >
              {isSettled
                ? `Settled: ${outcome === "Yes" ? "YES" : "NO"}`
                : isClosed
                  ? "Market Closed"
                  : `Closes in ${formatCountdown(countdown)}`}
            </span>
          </Flex>

          <div className="metric-grid">
            <Card className="metric-card">
              <Text size="1" color="gray">
                Strike
              </Text>
              <Heading as="h2" size="5">
                {formatPrice(strikePriceMicros)}
              </Heading>
            </Card>
            <Card className="metric-card">
              <Text size="1" color="gray">
                Close
              </Text>
              <Heading as="h2" size="5">
                4:00 PM ET
              </Heading>
            </Card>
            <Card className="metric-card">
              <Text size="1" color="gray">
                Status
              </Text>
              <Heading as="h2" size="5">
                {isSettled ? "Settled" : isClosed ? "Closed" : "Trading"}
              </Heading>
            </Card>
          </div>

          <div className="metric-grid">
            <Card className="metric-card">
              <Text size="1" color="gray">
                Cash
              </Text>
              <Text className="metric-mono" data-testid="usdc-balance">
                {usdcBalance != null ? formatPrice(Number(usdcBalance)) : "--"}
              </Text>
            </Card>
            <Card className="metric-card">
              <Text size="1" color="gray">
                Yes
              </Text>
              <Text
                className="metric-mono"
                data-testid="yes-balance"
              >
                {position ? formatTokens(position.yesQuantity) : "--"}
              </Text>
              <Text size="1" color="gray" data-testid="position-yes">
                {position ? `${formatTokens(position.yesQuantity)} tokens` : "No position"}
              </Text>
            </Card>
            <Card className="metric-card">
              <Text size="1" color="gray">
                No
              </Text>
              <Text
                className="metric-mono"
                data-testid="no-balance"
              >
                {position ? formatTokens(position.noQuantity) : "--"}
              </Text>
              <Text size="1" color="gray" data-testid="position-no">
                {position ? `${formatTokens(position.noQuantity)} tokens` : "No position"}
              </Text>
            </Card>
          </div>
        </Flex>
      </Card>

      <div className="trade-workspace-grid">
        {!isSettled && (
          <Card className="trade-panel">
            <Flex direction="column" gap="4">
              <div>
                <Text size="1" color="gray">
                  TRADE TICKET
                </Text>
                <Heading as="h2" size="6">
                  {formatTradingAction(selectedIntent)}
                </Heading>
              </div>

              <div>
                <Text size="1" color="gray">
                  Action
                </Text>
                <div className="segment-group">
                  {(["buy", "sell"] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      className={
                        tradeDirection === direction ? "segment-button active" : "segment-button"
                      }
                      aria-pressed={tradeDirection === direction}
                      onClick={() => setTradeDirection(direction)}
                    >
                      {direction === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Text size="1" color="gray">
                  Outcome
                </Text>
                <div className="segment-group">
                  {(["yes", "no"] as const).map((nextOutcome) => (
                    <button
                      key={nextOutcome}
                      type="button"
                      className={
                        selectedOutcome === nextOutcome
                          ? `segment-button ${nextOutcome} active`
                          : `segment-button ${nextOutcome}`
                      }
                      aria-pressed={selectedOutcome === nextOutcome}
                      onClick={() => setSelectedOutcome(nextOutcome)}
                    >
                      {nextOutcome === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="quote-grid">
                <div className="quote-stat">
                  <Text size="1" color="gray">
                    Best bid
                  </Text>
                  <Text className="metric-mono">
                    {selectedBestBid == null ? "No bid" : formatPrice(selectedBestBid)}
                  </Text>
                </div>
                <div className="quote-stat">
                  <Text size="1" color="gray">
                    Best ask
                  </Text>
                  <Text className="metric-mono">
                    {selectedBestAsk == null ? "No ask" : formatPrice(selectedBestAsk)}
                  </Text>
                </div>
                <div className="quote-stat">
                  <Text size="1" color="gray">
                    Spread
                  </Text>
                  <Text className="metric-mono">
                    {formatSpread(selectedBestBid, selectedBestAsk)}
                  </Text>
                </div>
                <div className="quote-stat highlighted">
                  <Text size="1" color="gray">
                    {tradeDirection === "buy" ? "Est. cost" : "Est. proceeds"}
                  </Text>
                  <Text className="metric-mono">
                    {selectedTotalMicros == null
                      ? "No quote"
                      : formatMicrosTotal(selectedTotalMicros)}
                  </Text>
                </div>
              </div>

              <Flex justify="between" align="center" gap="3" wrap="wrap">
                <label htmlFor="qty-input" className="ticket-label">
                  Quantity
                </label>
                <input
                  id="qty-input"
                  className="qty-input"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(Math.max(1, parseInt(event.target.value, 10) || 1))
                  }
                  disabled={executing}
                />
              </Flex>

              <div className="shortcut-row">
                {[1, 5, 10].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={quantity === amount ? "shortcut-chip active" : "shortcut-chip"}
                    onClick={() => setQuantity(amount)}
                    disabled={executing}
                  >
                    {amount}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                size="3"
                className={`trade-submit-button ${tradeDirection} ${selectedOutcome}`}
                onClick={() => {
                  void handleIntentClick();
                }}
                disabled={executing || isClosed || selectedDisabled || selectedExecutionPrice == null}
              >
                {executing ? "Awaiting Confirmation..." : formatTradingAction(selectedIntent)}
              </Button>

              {payoff && (
                <Card className="info-card">
                  <Text size="2">
                    {tradeDirection === "buy"
                      ? `${formatTradingAction(selectedIntent)} ${quantity} for ${formatMicrosTotal(selectedTotalMicros ?? 0)}. Max settlement value ${formatMicrosTotal(settlementValueMicros)}.`
                      : `${formatTradingAction(selectedIntent)} ${quantity} at ${formatPrice(selectedExecutionPrice ?? 0)} per token.`}
                  </Text>
                  <Text size="2" color="gray">
                    {payoff.formatDisplay(ticker, strikePriceMicros)}
                  </Text>
                </Card>
              )}

              {selectedGuidance && (
                <Card className="muted-card">
                  <Text size="2">{selectedGuidance}</Text>
                </Card>
              )}
              {showLiquidityMessage && (
                <Card className="muted-card">
                  <Text size="2">
                    No live {tradeDirection === "buy" ? "ask" : "bid"} is available for{" "}
                    {selectedOutcome.toUpperCase()} right now.
                  </Text>
                </Card>
              )}
              {(lastError || txStatus === "error") && (
                <Card className="error-card">
                  <Text size="2" data-testid="tx-error">
                    {lastError ?? "Transaction failed"}
                  </Text>
                </Card>
              )}
              {txStatus !== "idle" && (
                <Text size="1" color="gray" data-testid="tx-status">
                  {txStatus}
                  {txSignature ? `: ${txSignature}` : ""}
                </Text>
              )}
            </Flex>
          </Card>
        )}

        <Card className="book-panel">
          <Flex direction="column" gap="4">
            <div>
              <Text size="1" color="gray">
                LIVE ORDER BOOK
              </Text>
              <Heading as="h2" size="6">
                Bid / ask on one Phoenix market
              </Heading>
            </div>
            <div className="orderbook-grid">
              <SideQuoteCard
                label="Yes"
                ladder={yesLadder}
                active={selectedOutcome === "yes"}
              />
              <SideQuoteCard
                label="No"
                ladder={noLadder}
                active={selectedOutcome === "no"}
              />
            </div>
            <div className="orderbook-grid">
              <LadderView
                label="Yes"
                ladder={yesLadder}
                active={selectedOutcome === "yes"}
              />
              <LadderView
                label="No"
                ladder={noLadder}
                active={selectedOutcome === "no"}
              />
            </div>
          </Flex>
        </Card>
      </div>

      {hasWinningTokens && onRedeem && (
        <Card className="redeem-card">
          <Flex justify="between" align="center" gap="4" wrap="wrap">
            <div>
              <Text size="1" color="gray">
                REDEMPTION
              </Text>
              <Heading as="h2" size="5">
                Winning tokens ready
              </Heading>
              <Text size="2" color="gray">
                Market settled {outcome?.toUpperCase()}. Burn the winning side to
                receive USDC from the vault.
              </Text>
            </div>
            <Button
              type="button"
              size="3"
              onClick={() => {
                const redeemQty =
                  outcome === "Yes"
                    ? Number(position!.yesQuantity) / 1_000_000
                    : Number(position!.noQuantity) / 1_000_000;
                void onRedeem(Math.floor(redeemQty));
              }}
              disabled={executing}
            >
              {executing ? "Awaiting Confirmation..." : "Redeem"}
            </Button>
          </Flex>
        </Card>
      )}
    </div>
  );
}
