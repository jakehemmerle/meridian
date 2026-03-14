import type { HistoryEvent, TradeEvent, RedeemEvent } from "./model";

const PRICE_UNIT = 1_000_000;

function formatUsd(micros: number): string {
  return `$${(micros / PRICE_UNIT).toFixed(2)}`;
}

function formatSide(side: TradeEvent["side"]): string {
  const labels: Record<TradeEvent["side"], string> = {
    "buy-yes": "Buy Yes",
    "buy-no": "Buy No",
    "sell-yes": "Sell Yes",
    "sell-no": "Sell No",
  };
  return labels[side];
}

function TradeRow({ event }: { event: TradeEvent }) {
  return (
    <li>
      <span>{event.ticker}</span>
      <span>{formatSide(event.side)}</span>
      <span>{event.quantity}</span>
      <span>{formatUsd(event.priceMicros)}</span>
    </li>
  );
}

function RedeemRow({ event }: { event: RedeemEvent }) {
  return (
    <li>
      <span>{event.ticker}</span>
      <span>Redeem</span>
      <span>{formatUsd(event.payoutMicros)}</span>
    </li>
  );
}

interface HistoryListProps {
  events: HistoryEvent[];
}

export function HistoryList({ events }: HistoryListProps) {
  if (events.length === 0) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p>No history</p>
      </section>
    );
  }

  const sorted = [...events].sort((a, b) => b.timestampMs - a.timestampMs);

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
