import type { PortfolioPosition } from "./model";
import type { MarketPhase, MarketOutcome } from "../markets/model";
import {
  formatTokenAmount,
  formatUsdSigned,
  formatUsdBigint,
  PRICE_UNIT,
} from "../../lib/format";

function computePnl(position: PortfolioPosition): string {
  if (position.markPriceMicros === null) return "--";
  const diff = position.markPriceMicros - position.averageEntryPriceMicros;
  const pnl = (diff * position.quantity) / BigInt(PRICE_UNIT);
  return formatUsdSigned(pnl);
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
            <span>{formatTokenAmount(pos.quantity)}</span>
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

  const payoutDisplay = formatUsdBigint(quantity);
  const redeemablePairs = quantity / BigInt(PRICE_UNIT);

  return (
    <section className="panel">
      <p>Expected payout: {payoutDisplay}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => onRedeem(redeemablePairs)}
      >
        Redeem
      </button>
    </section>
  );
}
