import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { MarketSummary } from "./model";
import { MarketDiscoveryList } from "./view";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

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
    yesOpenInterest: 0n,
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
    yesOpenInterest: 0n,
  },
];

describe("MarketDiscoveryList", () => {
  it("renders market cards with ticker and price", () => {
    render(<MarketDiscoveryList markets={sampleMarkets} loading={false} />);
    expect(screen.getAllByText("BTC-50K").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ETH-4K").length).toBeGreaterThan(0);
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
        yesOpenInterest: 0n,
      },
    ];
    render(<MarketDiscoveryList markets={marketWithNullPrice} loading={false} />);
    expect(screen.getAllByText("SOL-200").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Yes:/)).not.toBeInTheDocument();
  });
});
