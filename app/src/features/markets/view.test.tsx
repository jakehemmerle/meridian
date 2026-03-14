import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { MarketSummary } from "./model";
import { MarketDiscoveryList } from "./view";

const sampleMarkets: MarketSummary[] = [
  {
    id: "m1",
    ticker: "BTC-50K",
    strikePriceMicros: 50_000_000_000n,
    tradingDay: 20260312,
    yesPriceMicros: 650_000n,
    closeTimeTs: 1741824000,
    phase: "Trading",
    outcome: "Unsettled",
    settledPrice: null,
    settlementTs: null,
  },
  {
    id: "m2",
    ticker: "ETH-4K",
    strikePriceMicros: 4_000_000_000n,
    tradingDay: 20260312,
    yesPriceMicros: 420_000n,
    closeTimeTs: 1741824000,
    phase: "Trading",
    outcome: "Unsettled",
    settledPrice: null,
    settlementTs: null,
  },
];

describe("MarketDiscoveryList", () => {
  it("renders market cards with ticker and price", () => {
    render(<MarketDiscoveryList markets={sampleMarkets} loading={false} />);
    expect(screen.getByText("BTC-50K")).toBeInTheDocument();
    expect(screen.getByText("ETH-4K")).toBeInTheDocument();
  });

  it("shows empty message when no markets", () => {
    render(<MarketDiscoveryList markets={[]} loading={false} />);
    expect(screen.getByText("No markets available.")).toBeInTheDocument();
  });

  it("shows loading indicator when loading", () => {
    render(<MarketDiscoveryList markets={[]} loading={true} />);
    expect(screen.getByText("Loading markets...")).toBeInTheDocument();
  });

  it("renders market with null yesPriceMicros without crashing", () => {
    const marketWithNullPrice: MarketSummary[] = [
      {
        id: "m3",
        ticker: "SOL-200",
        strikePriceMicros: 200_000_000n,
        tradingDay: 20260312,
        yesPriceMicros: null,
        closeTimeTs: 1741824000,
        phase: "Trading",
        outcome: "Unsettled",
        settledPrice: null,
        settlementTs: null,
      },
    ];
    render(<MarketDiscoveryList markets={marketWithNullPrice} loading={false} />);
    expect(screen.getByText("SOL-200")).toBeInTheDocument();
    expect(screen.queryByText(/Yes:/)).not.toBeInTheDocument();
  });
});
