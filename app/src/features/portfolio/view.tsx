import type { PortfolioPosition } from "./model";
import type { MarketPhase, MarketOutcome } from "../markets/model";

const PRICE_UNIT = 1_000_000;

function formatUsd(micros: number): string {
  const abs = Math.abs(micros);
  const formatted = `$${(abs / PRICE_UNIT).toFixed(2)}`;
  if (micros < 0) return `-${formatted}`;
  return `+${formatted}`;
}

function formatPayout(quantity: bigint): string {
  const dollars = Number(quantity) / PRICE_UNIT;
  return `$${dollars.toFixed(2)}`;
}

function computePnl(position: PortfolioPosition): string {
  if (position.markPriceMicros === null) return "--";
  const diff = Number(position.markPriceMicros - position.averageEntryPriceMicros);
  const pnl = diff * Number(position.quantity);
  return formatUsd(pnl);
}

// --- PortfolioPositionList ---

interface PortfolioPositionListProps {
  positions: PortfolioPosition[];
}

export function PortfolioPositionList({ positions }: PortfolioPositionListProps) {
  if (positions.length === 0) {
    return (
      <section className="panel">
        <h2>Portfolio</h2>
        <p>No active positions</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Portfolio</h2>
      <ul>
        {positions.map((pos) => (
          <li key={`${pos.marketId}-${pos.side}`} data-testid={`portfolio-item-${pos.ticker}`}>
            <span>{pos.ticker}</span>
            <span>{pos.side === "yes" ? "Yes" : "No"}</span>
            <span>{pos.quantity.toString()}</span>
            <span data-testid="pnl">{computePnl(pos)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- RedeemPanel ---

interface RedeemPanelProps {
  marketPhase: MarketPhase;
  marketOutcome: MarketOutcome;
  userSide: "yes" | "no";
  quantity: bigint;
  pending?: boolean;
  onRedeem: (quantity: bigint) => void;
}

export function RedeemPanel({
  marketPhase,
  marketOutcome,
  userSide,
  quantity,
  pending = false,
  onRedeem,
}: RedeemPanelProps) {
  if (marketPhase !== "Settled") {
    return null;
  }

  const isWinner =
    (marketOutcome === "Yes" && userSide === "yes") ||
    (marketOutcome === "No" && userSide === "no");

  if (!isWinner) {
    return (
      <section className="panel">
        <p>No payout</p>
      </section>
    );
  }

  const payoutDisplay = formatPayout(quantity * BigInt(PRICE_UNIT));

  return (
    <section className="panel">
      <p>Expected payout: {payoutDisplay}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => onRedeem(quantity)}
      >
        Redeem
      </button>
    </section>
  );
}
