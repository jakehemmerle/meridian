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
  },
  {
    id: "m2",
    ticker: "ETH-4K",
    strikePriceMicros: 4_000_000_000n,
    tradingDay: 20260312,
    yesPriceMicros: 420_000n,
    closeTimeTs: 1741824000,
  },
];

describe("MarketDiscoveryList", () => {
  it("renders market cards with ticker and price", () => {
    render(<MarketDiscoveryList markets={sampleMarkets} loading={false} />);
    expect(screen.getByText("BTC-50K")).toBeInTheDocument();
    expect(screen.getByText("ETH-4K")).toBeInTheDocument();
  });
});
