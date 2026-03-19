import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HistoryList } from "./view";
import type { HistoryEvent } from "./model";

describe("HistoryList", () => {
  it("shows empty history message when no events", () => {
    render(<HistoryList events={[]} />);
    expect(screen.getByText(/no history/i)).toBeInTheDocument();
  });

  it("renders a trade event with ticker, side, quantity, price", () => {
    const events: HistoryEvent[] = [
      {
        type: "trade",
        ticker: "AAPL",
        marketId: "market-aapl",
        side: "buy-yes",
        quantity: 10,
        priceMicros: 620_000,
        timestampMs: 1000,
        signature: "sig-1",
      },
    ];
    render(<HistoryList events={events} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText(/Buy Yes/i)).toBeInTheDocument();
    expect(screen.getByText("10.00")).toBeInTheDocument();
    expect(screen.getByText("$0.62")).toBeInTheDocument();
  });

  it("renders a redeem event with payout amount", () => {
    const events: HistoryEvent[] = [
      {
        type: "redeem",
        ticker: "AAPL",
        marketId: "market-aapl",
        payoutMicros: 5_000_000,
        quantity: 5,
        timestampMs: 2000,
        signature: "sig-2",
      },
    ];
    render(<HistoryList events={events} />);
    expect(screen.getByText(/Redeem/i)).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument();
  });

  it("renders events in descending timestamp order", () => {
    const events: HistoryEvent[] = [
      {
        type: "trade",
        ticker: "AAPL",
        marketId: "market-aapl",
        side: "buy-yes",
        quantity: 10,
        priceMicros: 620_000,
        timestampMs: 1000,
        signature: "sig-3",
      },
      {
        type: "trade",
        ticker: "MSFT",
        marketId: "market-msft",
        side: "sell-no",
        quantity: 5,
        priceMicros: 400_000,
        timestampMs: 2000,
        signature: "sig-4",
      },
    ];
    render(<HistoryList events={events} />);
    const items = screen.getAllByRole("row").slice(1);
    // MSFT (ts=2000) should appear before AAPL (ts=1000)
    expect(items[0]).toHaveTextContent("MSFT");
    expect(items[1]).toHaveTextContent("AAPL");
  });
});
