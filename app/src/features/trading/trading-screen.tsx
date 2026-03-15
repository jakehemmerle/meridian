import { useState } from "react";
import type { OrderBookLadder, OrderBookLevel } from "@meridian/domain";
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
      <table>
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
              <td>{row.bidSize ?? ""}</td>
              <td>{formatUsd(row.price)}</td>
              <td>{row.askSize ?? ""}</td>
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
}: TradingScreenProps) {
  const [selectedIntent, setSelectedIntent] = useState<TradeIntent>("buy-yes");
  const constraints = getPositionConstraints(position);
  const nowUtc = Math.floor(Date.now() / 1000);
  const countdown = getCountdownSeconds(marketCloseUtc, nowUtc);
  const isClosed = countdown <= 0;

  const bestPrice = getBestPriceForIntent(
    selectedIntent,
    yesLadder,
    noLadder,
  );
  const payoff = bestPrice != null ? computePayoff(selectedIntent, bestPrice) : null;

  function handleIntentClick(intent: TradeIntent) {
    setSelectedIntent(intent);
    onIntent(intent);
  }

  function isIntentDisabled(intent: TradeIntent): boolean {
    if (intent === "buy-yes") return !constraints.canBuyYes;
    if (intent === "buy-no") return !constraints.canBuyNo;
    if (intent === "sell-yes") return !constraints.canSellYes;
    if (intent === "sell-no") return !constraints.canSellNo;
    return false;
  }

  return (
    <section className="trading-screen">
      <header>
        <h2>
          {ticker} — Strike {formatUsd(strikePriceMicros)}
        </h2>
        {isClosed ? (
          <span data-testid="countdown-timer">Market Closed</span>
        ) : (
          <span data-testid="countdown-timer">
            Closes in {formatCountdown(countdown)}
          </span>
        )}
      </header>

      <div className="order-book">
        <LadderView label="Yes" ladder={yesLadder} />
        <LadderView label="No" ladder={noLadder} />
      </div>

      <div className="intent-buttons">
        {tradingIntentDescriptors.map((desc) => (
          <button
            key={desc.intent}
            onClick={() => handleIntentClick(desc.intent)}
            disabled={isIntentDisabled(desc.intent)}
            aria-pressed={selectedIntent === desc.intent}
          >
            {desc.label}
          </button>
        ))}
      </div>

      {!constraints.canBuyYes && (
        <p className="guidance">{constraints.buyYesGuidance}</p>
      )}
      {!constraints.canBuyNo && (
        <p className="guidance">{constraints.buyNoGuidance}</p>
      )}
      {!constraints.canSellYes && (
        <p className="guidance">{constraints.sellYesGuidance}</p>
      )}
      {!constraints.canSellNo && (
        <p className="guidance">{constraints.sellNoGuidance}</p>
      )}

      {payoff && (
        <p className="payoff">
          {payoff.formatDisplay(ticker, strikePriceMicros)}
        </p>
      )}
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
