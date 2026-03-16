import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PublicKey } from "@solana/web3.js";
import type { MarketSummary } from "./model";
import { MarketDiscoveryList } from "./view";

const DUMMY_KEY = new PublicKey("11111111111111111111111111111111");

function makeMarket(overrides: Partial<MarketSummary> & { id: string; ticker: string }): MarketSummary {
  return {
    pda: DUMMY_KEY,
    strikePriceMicros: 0n,
    tradingDay: 20260312,
    yesPriceMicros: null,
    closeTimeTs: 1741824000,
    phase: "Trading",
    outcome: "Unsettled",
    phoenixMarket: DUMMY_KEY,
    yesMint: DUMMY_KEY,
    noMint: DUMMY_KEY,
    vault: DUMMY_KEY,
    settledPrice: null,
    settlementTs: null,
    yesOpenInterest: 0n,
    ...overrides,
  };
}

const sampleMarkets: MarketSummary[] = [
  makeMarket({
    id: "m1",
    ticker: "BTC-50K",
    strikePriceMicros: 50_000_000_000n,
    yesPriceMicros: 650_000n,
  }),
  makeMarket({
    id: "m2",
    ticker: "ETH-4K",
    strikePriceMicros: 4_000_000_000n,
    yesPriceMicros: 420_000n,
  }),
];

describe("MarketDiscoveryList", () => {
  it("renders market cards with ticker and price", () => {
    render(<MarketDiscoveryList markets={sampleMarkets} loading={false} />);
    expect(screen.getByText(/BTC-50K/)).toBeInTheDocument();
    expect(screen.getByText(/ETH-4K/)).toBeInTheDocument();
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
      makeMarket({
        id: "m3",
        ticker: "SOL-200",
        strikePriceMicros: 200_000_000n,
        yesPriceMicros: null,
      }),
    ];
    render(<MarketDiscoveryList markets={marketWithNullPrice} loading={false} />);
    expect(screen.getByText(/SOL-200/)).toBeInTheDocument();
  });
});
