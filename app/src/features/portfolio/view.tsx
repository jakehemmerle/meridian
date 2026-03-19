import { Button, Card, Flex, Heading, Text } from "@radix-ui/themes";

import type { PortfolioPosition } from "./model";
import type { MarketOutcome, MarketPhase } from "../markets/model";
import {
  PRICE_UNIT,
  formatTokenAmount,
  formatUsdBigint,
  formatUsdSigned,
} from "../../lib/format";

function computePnl(position: PortfolioPosition): string {
  if (position.markPriceMicros === null || position.averageEntryPriceMicros <= 0n) {
    return "Unavailable";
  }

  const diff = position.markPriceMicros - position.averageEntryPriceMicros;
  const pnl = (diff * position.quantity) / BigInt(PRICE_UNIT);
  return formatUsdSigned(pnl);
}

interface PortfolioPositionListProps {
  positions: PortfolioPosition[];
}

export function PortfolioPositionList({ positions }: PortfolioPositionListProps) {
  if (positions.length === 0) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Heading as="h2" size="5">
            Portfolio
          </Heading>
          <Text size="2" color="gray">
            No active positions
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Card>
      <Flex direction="column" gap="4">
        <div>
          <Text size="1" color="gray">
            POSITIONS
          </Text>
          <Heading as="h2" size="6">
            Active inventory
          </Heading>
        </div>

        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr
                  key={`${position.marketId}-${position.side}`}
                  data-testid={`portfolio-item-${position.ticker}`}
                >
                  <td>{position.ticker}</td>
                  <td>{position.side === "yes" ? "Yes" : "No"}</td>
                  <td className="metric-mono">{formatTokenAmount(position.quantity)}</td>
                  <td className="metric-mono">
                    {position.averageEntryPriceMicros > 0n
                      ? formatUsdBigint(position.averageEntryPriceMicros)
                      : "Unavailable"}
                  </td>
                  <td className="metric-mono">
                    {position.markPriceMicros != null
                      ? formatUsdBigint(position.markPriceMicros)
                      : "Unavailable"}
                  </td>
                  <td data-testid="pnl" className="metric-mono">
                    {computePnl(position)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Flex>
    </Card>
  );
}

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
      <Card>
        <Text size="2">No payout</Text>
      </Card>
    );
  }

  const payoutDisplay = formatUsdBigint(quantity);
  const redeemablePairs = quantity / BigInt(PRICE_UNIT);

  return (
    <Card>
      <Flex direction="column" gap="3" align="start">
        <Text size="2">Expected payout: {payoutDisplay}</Text>
        <Button
          type="button"
          disabled={pending}
          onClick={() => onRedeem(redeemablePairs)}
        >
          Redeem
        </Button>
      </Flex>
    </Card>
  );
}
