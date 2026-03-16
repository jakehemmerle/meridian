import { useMemo } from "react";
import type { HistoryEvent, TradeEvent, RedeemEvent } from "./model";
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

function TradeRow({ event }: { event: TradeEvent }) {
  return (
    <li>
      <span>{event.ticker}</span>
      <span>{formatSide(event.side)}</span>
      <span>{formatTokenAmount(BigInt(event.quantity) * 1_000_000n)}</span>
      <span>{formatMicros(event.priceMicros)}</span>
    </li>
  );
}

function RedeemRow({ event }: { event: RedeemEvent }) {
  return (
    <li>
      <span>{event.ticker}</span>
      <span>Redeem</span>
      <span>{formatMicros(event.payoutMicros)}</span>
    </li>
  );
}

interface HistoryListProps {
  events: HistoryEvent[];
}

export function HistoryList({ events }: HistoryListProps) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => b.timestampMs - a.timestampMs),
    [events],
  );

  if (events.length === 0) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p>No history</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>History</h2>
      <ul>
        {sorted.map((event, idx) => {
          const key = `${event.type}-${event.timestampMs}-${idx}`;
          if (event.type === "trade") {
            return <TradeRow key={key} event={event} />;
          }
          return <RedeemRow key={key} event={event} />;
        })}
      </ul>
    </section>
  );
}
