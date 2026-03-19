"use client";

import { useState } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { OrderBookLadder } from "@meridian/domain";
import {
  type TradeIntent,
  type UserPosition,
  getPositionConstraints,
  computePayoff,
  getCountdownSeconds,
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
  // Wired-up mode props
  onExecute?: (intent: TradeIntent, quantity: number) => Promise<void>;
  usdcBalance?: bigint | null;
  executing?: boolean;
  lastError?: string | null;
  phase?: "Trading" | "Closed" | "Settled";
  outcome?: "Unsettled" | "Yes" | "No";
  onRedeem?: (quantity: number) => Promise<void>;
  onBack?: () => void;
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

function SpreadBar({
  ladder,
  label,
}: {
  ladder: OrderBookLadder | null;
  label: string;
}) {
  const bestBid = ladder?.bids[0]?.priceMicros ?? null;
  const bestAsk = ladder?.asks[0]?.priceMicros ?? null;
  const rows = ladder ? mergeLevels(ladder).slice(0, 4) : [];

  return (
    <div className="spread-bar">
      <div className="spread-bar-cell spread-bar-bid">
        <span className="spread-bar-value">
          {bestBid == null ? "—" : formatPrice(bestBid)}
        </span>
        <span className="spread-bar-label">Best Bid</span>
      </div>

      <HoverCard.Root openDelay={400} closeDelay={200}>
        <HoverCard.Trigger asChild>
          <button type="button" className="spread-bar-cell spread-bar-spread">
            <span className="spread-bar-value">
              {formatSpread(bestBid, bestAsk)}
            </span>
            <span className="spread-bar-label">Spread</span>
          </button>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content className="depth-popover" sideOffset={8}>
            <p className="depth-popover-title">{label} Depth</p>
            {rows.length === 0 ? (
              <p className="depth-popover-empty">
                {ladder == null ? "Loading..." : "No resting orders"}
              </p>
            ) : (
              <table className="ob-table">
                <thead>
                  <tr>
                    <th>Bid</th>
                    <th>Price</th>
                    <th>Ask</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="bid-cell">{row.bidSize ?? ""}</td>
                      <td className="price-cell">{formatPrice(row.price)}</td>
                      <td className="ask-cell">{row.askSize ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <HoverCard.Arrow className="depth-arrow" />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>

      <div className="spread-bar-cell spread-bar-ask">
        <span className="spread-bar-value">
          {bestAsk == null ? "—" : formatPrice(bestAsk)}
        </span>
        <span className="spread-bar-label">Best Ask</span>
      </div>
    </div>
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

  async function handleIntentClick() {
    if (onExecute) {
      try {
        await onExecute(selectedIntent, quantity);
      } catch {
        // Error handled by parent via lastError prop
      }
    } else {
      onIntent(selectedIntent);
    }
  }

  const hasWinningTokens =
    isSettled &&
    position &&
    ((outcome === "Yes" && position.yesQuantity > 0n) ||
      (outcome === "No" && position.noQuantity > 0n));
  const question = `Will ${ticker} close above ${formatPrice(strikePriceMicros)} today?`;
  const summary = `Yes settles to $1.00 if ${ticker} finishes above the strike at the close. No settles to $1.00 if it does not.`;
  const actionLabel = formatTradingAction(selectedIntent);
  const showLiquidityMessage =
    !isSettled && selectedExecutionPrice == null && !selectedGuidance;

  return (
    <section className="trading-screen">
      <header className="trade-hero">
        <div className="trade-hero-top">
          {onBack && (
            <button type="button" className="back-btn" onClick={onBack}>
              &larr; Markets
            </button>
          )}
          {isSettled ? (
            <span data-testid="countdown-timer" className="phase-badge settled">
              Settled: {outcome === "Yes" ? "YES" : "NO"}
            </span>
          ) : isClosed ? (
            <span data-testid="countdown-timer" className="phase-badge closed">
              Market Closed
            </span>
          ) : (
            <span data-testid="countdown-timer" className="phase-badge live">
              Closes in {formatCountdown(countdown)}
            </span>
          )}
        </div>

        <p className="trade-kicker">{ticker} Daily Market</p>
        <h1 className="trade-question">{question}</h1>
        <p className="trade-summary">{summary}</p>

        <div className="trade-meta-grid">
          <div className="trade-meta-card">
            <span>Strike</span>
            <strong>{formatPrice(strikePriceMicros)}</strong>
          </div>
          <div className="trade-meta-card">
            <span>Close</span>
            <strong>4:00 PM ET</strong>
          </div>
          <div className="trade-meta-card">
            <span>Status</span>
            <strong>{isSettled ? "Settled" : isClosed ? "Closed" : "Trading"}</strong>
          </div>
        </div>

        {(position || usdcBalance != null) && (
          <div className="balance-chips">
            {usdcBalance != null && (
              <div className="balance-chip">
                <span>Cash</span>
                <strong>{formatPrice(Number(usdcBalance))}</strong>
              </div>
            )}
            {position && (
              <div className="balance-chip">
                <span>Yes</span>
                <strong>{formatTokens(position.yesQuantity)}</strong>
              </div>
            )}
            {position && (
              <div className="balance-chip">
                <span>No</span>
                <strong>{formatTokens(position.noQuantity)}</strong>
              </div>
            )}
          </div>
        )}
      </header>

      {!isSettled && (
        <section className="ticket-panel">
            <div className="ticket-heading">
              <p className="ticket-kicker">Trade Ticket</p>
              <h2>{actionLabel}</h2>
            </div>

            <div className="ticket-toggle-group">
              <span className="ticket-label">Action</span>
              <ToggleGroup.Root
                type="single"
                value={tradeDirection}
                onValueChange={(v) => { if (v) setTradeDirection(v as TradeDirection); }}
                className="segmented-control"
              >
                <ToggleGroup.Item value="buy" className="segment">
                  Buy
                </ToggleGroup.Item>
                <ToggleGroup.Item value="sell" className="segment">
                  Sell
                </ToggleGroup.Item>
              </ToggleGroup.Root>
            </div>

            <div className="ticket-toggle-group">
              <span className="ticket-label">Outcome</span>
              <ToggleGroup.Root
                type="single"
                value={selectedOutcome}
                onValueChange={(v) => { if (v) setSelectedOutcome(v as TradeOutcome); }}
                className="segmented-control outcome-control"
              >
                <ToggleGroup.Item value="yes" className="segment yes">
                  Yes
                </ToggleGroup.Item>
                <ToggleGroup.Item value="no" className="segment no">
                  No
                </ToggleGroup.Item>
              </ToggleGroup.Root>
            </div>

            <SpreadBar
              ladder={selectedLadder}
              label={selectedOutcome === "yes" ? "Yes" : "No"}
            />

            <p className="cost-line">
              <span className="cost-line-label">
                {tradeDirection === "buy" ? "You pay" : "You receive"}
              </span>
              {selectedExecutionPrice != null ? (
                <>
                  <span className="cost-line-calc">
                    {formatPrice(selectedExecutionPrice)} × {quantity}
                  </span>
                  <strong className="cost-line-total">
                    {formatMicrosTotal(selectedTotalMicros!)}
                  </strong>
                </>
              ) : (
                <span className="cost-line-calc">No quote</span>
              )}
            </p>

            <div className="quantity-block">
              <div className="quantity-row">
                <label htmlFor="qty-input">Quantity</label>
                <input
                  id="qty-input"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  disabled={executing}
                />
              </div>
              <ToggleGroup.Root
                type="single"
                value={[1, 5, 10].includes(quantity) ? String(quantity) : ""}
                onValueChange={(v) => { if (v) setQuantity(Number(v)); }}
                className="quantity-shortcuts"
              >
                {[1, 5, 10].map((amount) => (
                  <ToggleGroup.Item
                    key={amount}
                    value={String(amount)}
                    className="shortcut"
                    disabled={executing}
                  >
                    {amount}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            </div>

            <button
              type="button"
              className={`trade-submit ${tradeDirection} ${selectedOutcome}`}
              onClick={() => handleIntentClick()}
              disabled={executing || isClosed || selectedDisabled || selectedExecutionPrice == null}
            >
              {executing ? "Awaiting Confirmation..." : actionLabel}
            </button>

            {payoff && (
              <p className="payoff">
                {tradeDirection === "buy"
                  ? `${actionLabel} ${quantity} for ${formatMicrosTotal(selectedTotalMicros ?? 0)}. Max settlement value ${formatMicrosTotal(settlementValueMicros)}.`
                  : `${actionLabel} ${quantity} at ${formatPrice(selectedExecutionPrice ?? 0)} per token.`}
                {" "}
                {payoff.formatDisplay(ticker, strikePriceMicros)}
              </p>
            )}

            {selectedGuidance && <p className="guidance">{selectedGuidance}</p>}
            {showLiquidityMessage && (
              <p className="guidance">
                No live {tradeDirection === "buy" ? "ask" : "bid"} is available for {selectedOutcome.toUpperCase()} right now.
              </p>
            )}
            {lastError && <p className="trade-error">{lastError}</p>}
          </section>
      )}

      {hasWinningTokens && onRedeem && (
        <div className="redeem-section">
          <p>
            Market settled <strong>{outcome?.toUpperCase()}</strong>. You have
            winning tokens to redeem.
          </p>
          <button
            type="button"
            className="trade-submit buy yes"
            onClick={() => {
              const redeemQty =
                outcome === "Yes"
                  ? Number(position!.yesQuantity) / 1_000_000
                  : Number(position!.noQuantity) / 1_000_000;
              onRedeem(Math.floor(redeemQty));
            }}
            disabled={executing}
          >
            {executing ? "Redeeming..." : "Redeem Winnings"}
          </button>
        </div>
      )}
    </section>
  );
}
