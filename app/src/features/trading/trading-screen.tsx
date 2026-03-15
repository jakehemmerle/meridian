"use client";

import { useState } from "react";
import type { OrderBookLadder } from "@meridian/domain";
import {
  type TradeIntent,
  type UserPosition,
  tradingIntentDescriptors,
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

function LadderView({
  label,
  ladder,
}: {
  label: string;
  ladder: OrderBookLadder | null;
}) {
  if (!ladder) return null;
  return (
    <div className="ladder">
      <h3>{label}</h3>
      <table className="ob-table">
        <thead>
          <tr>
            <th>Bid</th>
            <th>Price</th>
            <th>Ask</th>
          </tr>
        </thead>
        <tbody>
          {mergeLevels(ladder).map((row, i) => (
            <tr key={i}>
              <td className="bid-cell">{row.bidSize ?? ""}</td>
              <td className="price-cell">{formatPrice(row.price)}</td>
              <td className="ask-cell">{row.askSize ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [selectedIntent, setSelectedIntent] = useState<TradeIntent>("buy-yes");
  const [quantity, setQuantity] = useState(1);
  const constraints = getPositionConstraints(position);
  const nowUtc = Math.floor(Date.now() / 1000);
  const countdown = getCountdownSeconds(marketCloseUtc, nowUtc);
  const isClosed = countdown <= 0;
  const isSettled = phase === "Settled";

  const bestPrice = getBestPriceForIntent(selectedIntent, yesLadder, noLadder);
  const payoff =
    bestPrice != null ? computePayoff(selectedIntent, bestPrice) : null;

  async function handleIntentClick(intent: TradeIntent) {
    setSelectedIntent(intent);
    if (onExecute) {
      try {
        await onExecute(intent, quantity);
      } catch {
        // Error handled by parent via lastError prop
      }
    } else {
      onIntent(intent);
    }
  }

  function isIntentDisabled(intent: TradeIntent): boolean {
    if (executing) return true;
    if (intent === "buy-yes") return !constraints.canBuyYes;
    if (intent === "buy-no") return !constraints.canBuyNo;
    if (intent === "sell-yes") return !constraints.canSellYes;
    if (intent === "sell-no") return !constraints.canSellNo;
    return false;
  }

  const hasWinningTokens =
    isSettled &&
    position &&
    ((outcome === "Yes" && position.yesQuantity > 0n) ||
      (outcome === "No" && position.noQuantity > 0n));

  return (
    <section className="trading-screen">
      <header className="trading-header">
        {onBack && (
          <button type="button" className="back-btn" onClick={onBack}>
            &larr; Markets
          </button>
        )}
        <h2>
          {ticker} &mdash; Strike {formatPrice(strikePriceMicros)}
        </h2>
        {isSettled ? (
          <span data-testid="countdown-timer" className="phase-badge settled">
            Settled: {outcome === "Yes" ? "YES" : "NO"}
          </span>
        ) : isClosed ? (
          <span data-testid="countdown-timer" className="phase-badge closed">
            Market Closed
          </span>
        ) : (
          <span data-testid="countdown-timer">
            Closes in {formatCountdown(countdown)}
          </span>
        )}
      </header>

      {/* Balances */}
      {(position || usdcBalance != null) && (
        <div className="balances-bar">
          {usdcBalance != null && (
            <span>USDC: {formatTokens(usdcBalance)}</span>
          )}
          {position && <span>Yes: {formatTokens(position.yesQuantity)}</span>}
          {position && <span>No: {formatTokens(position.noQuantity)}</span>}
        </div>
      )}

      {/* Order Book */}
      <div className="order-book">
        <LadderView label="Yes" ladder={yesLadder} />
        <LadderView label="No" ladder={noLadder} />
      </div>

      {/* Quantity + Intent Buttons */}
      {!isSettled && (
        <>
          {onExecute && (
            <div className="quantity-row">
              <label htmlFor="qty-input">Quantity (tokens):</label>
              <input
                id="qty-input"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                }
                disabled={executing}
              />
            </div>
          )}
          <div className="intent-buttons">
            {tradingIntentDescriptors.map((desc) => (
              <button
                key={desc.intent}
                className={`intent-btn intent-${desc.intent}`}
                onClick={() => handleIntentClick(desc.intent)}
                disabled={isIntentDisabled(desc.intent)}
                aria-pressed={selectedIntent === desc.intent}
              >
                {executing && selectedIntent === desc.intent
                  ? "Sending..."
                  : desc.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Redeem section for settled markets */}
      {hasWinningTokens && onRedeem && (
        <div className="redeem-section">
          <p>
            Market settled <strong>{outcome?.toUpperCase()}</strong>. You have
            winning tokens to redeem.
          </p>
          <button
            type="button"
            className="intent-btn redeem-btn"
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

      {/* Guidance */}
      {!constraints.canBuyYes && constraints.buyYesGuidance && (
        <p className="guidance">{constraints.buyYesGuidance}</p>
      )}
      {!constraints.canBuyNo && constraints.buyNoGuidance && (
        <p className="guidance">{constraints.buyNoGuidance}</p>
      )}
      {!constraints.canSellYes && constraints.sellYesGuidance && (
        <p className="guidance">{constraints.sellYesGuidance}</p>
      )}
      {!constraints.canSellNo && constraints.sellNoGuidance && (
        <p className="guidance">{constraints.sellNoGuidance}</p>
      )}

      {payoff && !isSettled && (
        <p className="payoff">
          {payoff.formatDisplay(ticker, strikePriceMicros)}
        </p>
      )}

      {lastError && <p className="trade-error">{lastError}</p>}
    </section>
  );
}

function getBestPriceForIntent(
  intent: TradeIntent,
  yesLadder: OrderBookLadder | null,
  noLadder: OrderBookLadder | null,
): number | null {
  switch (intent) {
    case "buy-yes":
      return yesLadder?.asks[0]?.priceMicros ?? null;
    case "buy-no":
      return noLadder?.asks[0]?.priceMicros ?? null;
    case "sell-yes":
      return yesLadder?.bids[0]?.priceMicros ?? null;
    case "sell-no":
      return noLadder?.bids[0]?.priceMicros ?? null;
  }
}
