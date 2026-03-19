import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Flex, Heading, Tabs, Text } from "@radix-ui/themes";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

import type { HistoryEvent, RedeemEvent, TradeEvent } from "./model";
import { formatMicros, formatTokenAmount } from "../../lib/format";

const SIDE_LABELS: Record<TradeEvent["side"], string> = {
  "buy-yes": "Buy Yes",
  "buy-no": "Buy No",
  "sell-yes": "Sell Yes",
  "sell-no": "Sell No",
};

function formatSide(side: TradeEvent["side"]): string {
  return SIDE_LABELS[side];
}

function formatTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildExplorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

function matchesFilter(
  event: HistoryEvent,
  filter: "all" | "trade" | "redeem",
): boolean {
  return filter === "all" || event.type === filter;
}

function TradeRow({ event }: { event: TradeEvent }) {
  return (
    <tr>
      <td>{formatTimestamp(event.timestampMs)}</td>
      <td>{event.ticker}</td>
      <td>{formatSide(event.side)}</td>
      <td className="metric-mono">{formatTokenAmount(BigInt(event.quantity) * 1_000_000n)}</td>
      <td className="metric-mono">{formatMicros(event.priceMicros)}</td>
      <td>
        <Link href={`/trade/${event.marketId}`} className="inline-link">
          Market
        </Link>
      </td>
      <td>
        <a
          href={buildExplorerUrl(event.signature)}
          target="_blank"
          rel="noreferrer"
          className="inline-link"
        >
          Tx
          <ExternalLinkIcon />
        </a>
      </td>
    </tr>
  );
}

function RedeemRow({ event }: { event: RedeemEvent }) {
  return (
    <tr>
      <td>{formatTimestamp(event.timestampMs)}</td>
      <td>{event.ticker}</td>
      <td>Redeem</td>
      <td className="metric-mono">{event.quantity.toFixed(2)}</td>
      <td className="metric-mono">{formatMicros(event.payoutMicros)}</td>
      <td>
        <Link href={`/trade/${event.marketId}`} className="inline-link">
          Market
        </Link>
      </td>
      <td>
        <a
          href={buildExplorerUrl(event.signature)}
          target="_blank"
          rel="noreferrer"
          className="inline-link"
        >
          Tx
          <ExternalLinkIcon />
        </a>
      </td>
    </tr>
  );
}

interface HistoryListProps {
  events: HistoryEvent[];
}

export function HistoryList({ events }: HistoryListProps) {
  const [filter, setFilter] = useState<"all" | "trade" | "redeem">("all");
  const sorted = useMemo(
    () => [...events].sort((a, b) => b.timestampMs - a.timestampMs),
    [events],
  );
  const filteredEvents = useMemo(
    () => sorted.filter((event) => matchesFilter(event, filter)),
    [filter, sorted],
  );

  if (events.length === 0) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Heading as="h2" size="5">
            History
          </Heading>
          <Text size="2" color="gray">
            No history
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
            ACTIVITY FEED
          </Text>
          <Heading as="h2" size="6">
            Trade and redemption log
          </Heading>
        </div>

        <Tabs.Root
          value={filter}
          onValueChange={(value) => setFilter(value as "all" | "trade" | "redeem")}
        >
          <Tabs.List>
            <Tabs.Trigger value="all">All</Tabs.Trigger>
            <Tabs.Trigger value="trade">Trades</Tabs.Trigger>
            <Tabs.Trigger value="redeem">Redemptions</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>

        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Ticker</th>
                <th>Action</th>
                <th>Qty</th>
                <th>Price / Payout</th>
                <th>Route</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event, index) => {
                const key = `${event.type}-${event.signature}-${index}`;
                if (event.type === "trade") {
                  return <TradeRow key={key} event={event} />;
                }
                return <RedeemRow key={key} event={event} />;
              })}
            </tbody>
          </table>
        </div>
      </Flex>
    </Card>
  );
}
