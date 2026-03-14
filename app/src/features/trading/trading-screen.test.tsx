import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { OrderBookLadder } from "@meridian/domain";
import { TradingScreen } from "./trading-screen";
import type { UserPosition } from "./model";

const sampleYesLadder: OrderBookLadder = {
  bids: [
    { priceMicros: 600_000, sizeLots: 10 },
    { priceMicros: 580_000, sizeLots: 20 },
  ],
  asks: [
    { priceMicros: 620_000, sizeLots: 15 },
    { priceMicros: 650_000, sizeLots: 8 },
  ],
};

const sampleNoLadder: OrderBookLadder = {
  bids: [
    { priceMicros: 380_000, sizeLots: 15 },
    { priceMicros: 350_000, sizeLots: 8 },
  ],
  asks: [
    { priceMicros: 400_000, sizeLots: 10 },
    { priceMicros: 420_000, sizeLots: 20 },
  ],
};

const baseProps = {
  ticker: "AAPL",
  strikePriceMicros: 175_000_000,
  yesLadder: sampleYesLadder,
  noLadder: sampleNoLadder,
  marketCloseUtc: Math.floor(Date.now() / 1000) + 3600,
  position: null as UserPosition | null,
  onIntent: vi.fn(),
};

describe("TradingScreen", () => {
  // --- Order book rendering ---

  it("renders one order book with Yes and No perspectives", () => {
    render(<TradingScreen {...baseProps} />);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("displays Yes-side bid/ask levels from the Yes ladder", () => {
    render(<TradingScreen {...baseProps} />);
    // Best Yes bid at $0.60
    expect(screen.getByText("$0.60")).toBeInTheDocument();
    // Best Yes ask at $0.62
    expect(screen.getByText("$0.62")).toBeInTheDocument();
  });

  it("displays No-side prices derived from the Yes book", () => {
    render(<TradingScreen {...baseProps} />);
    // No bids: inverted from Yes asks. Best No bid = $0.38
    expect(screen.getByText("$0.38")).toBeInTheDocument();
    // No asks: inverted from Yes bids. Best No ask = $0.40
    expect(screen.getByText("$0.40")).toBeInTheDocument();
  });

  // --- Intent buttons ---

  it("renders all four trade intent buttons", () => {
    render(<TradingScreen {...baseProps} />);
    expect(screen.getByRole("button", { name: /Buy Yes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy No/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sell Yes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sell No/i })).toBeInTheDocument();
  });

  it("calls onIntent with the correct intent when a button is clicked", async () => {
    const onIntent = vi.fn();
    render(<TradingScreen {...baseProps} onIntent={onIntent} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Buy Yes/i }));
    expect(onIntent).toHaveBeenCalledWith("buy-yes");

    await user.click(screen.getByRole("button", { name: /Buy No/i }));
    expect(onIntent).toHaveBeenCalledWith("buy-no");
  });

  // --- Position-aware controls ---

  it("disables Sell Yes when user has no Yes position", () => {
    render(<TradingScreen {...baseProps} position={null} />);
    expect(screen.getByRole("button", { name: /Sell Yes/i })).toBeDisabled();
  });

  it("disables Sell No when user has no No position", () => {
    render(<TradingScreen {...baseProps} position={null} />);
    expect(screen.getByRole("button", { name: /Sell No/i })).toBeDisabled();
  });

  it("enables Sell Yes when user holds Yes tokens", () => {
    const position: UserPosition = { yesQuantity: 5n, noQuantity: 0n };
    render(<TradingScreen {...baseProps} position={position} />);
    expect(screen.getByRole("button", { name: /Sell Yes/i })).toBeEnabled();
  });

  it("enables Sell No when user holds No tokens", () => {
    const position: UserPosition = { yesQuantity: 0n, noQuantity: 3n };
    render(<TradingScreen {...baseProps} position={position} />);
    expect(screen.getByRole("button", { name: /Sell No/i })).toBeEnabled();
  });

  it("shows guidance text for disabled sell buttons", () => {
    render(<TradingScreen {...baseProps} position={null} />);
    expect(
      screen.getByText("You need Yes tokens to sell."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You need No tokens to sell."),
    ).toBeInTheDocument();
  });

  // --- Buy position constraints ---

  it("disables Buy Yes when user holds No tokens", () => {
    const position: UserPosition = { yesQuantity: 0n, noQuantity: 5n };
    render(<TradingScreen {...baseProps} position={position} />);
    expect(screen.getByRole("button", { name: /Buy Yes/i })).toBeDisabled();
  });

  it("disables Buy No when user holds Yes tokens", () => {
    const position: UserPosition = { yesQuantity: 5n, noQuantity: 0n };
    render(<TradingScreen {...baseProps} position={position} />);
    expect(screen.getByRole("button", { name: /Buy No/i })).toBeDisabled();
  });

  it("shows buy guidance text when buy is constrained", () => {
    const position: UserPosition = { yesQuantity: 5n, noQuantity: 0n };
    render(<TradingScreen {...baseProps} position={position} />);
    expect(
      screen.getByText("Sell your Yes tokens first."),
    ).toBeInTheDocument();
  });

  it("re-checks constraints after intent callback", async () => {
    const position: UserPosition = { yesQuantity: 0n, noQuantity: 5n };
    const onIntent = vi.fn();
    render(<TradingScreen {...baseProps} position={position} onIntent={onIntent} />);
    const user = userEvent.setup();

    // Buy Yes is disabled due to holding No tokens
    expect(screen.getByRole("button", { name: /Buy Yes/i })).toBeDisabled();

    // Sell No is enabled — clicking it triggers onIntent
    await user.click(screen.getByRole("button", { name: /Sell No/i }));
    expect(onIntent).toHaveBeenCalledWith("sell-no");

    // Constraints are still applied (position hasn't changed in props)
    expect(screen.getByRole("button", { name: /Buy Yes/i })).toBeDisabled();
  });

  // --- Countdown timer ---

  it("displays a countdown timer", () => {
    render(<TradingScreen {...baseProps} />);
    // Should show time remaining in some format
    expect(screen.getByTestId("countdown-timer")).toBeInTheDocument();
  });

  it("shows market closed when countdown reaches zero", () => {
    const pastClose = Math.floor(Date.now() / 1000) - 100;
    render(<TradingScreen {...baseProps} marketCloseUtc={pastClose} />);
    expect(screen.getByText("Market Closed")).toBeInTheDocument();
  });

  // --- Payoff display ---

  it("displays payoff information for the selected intent", () => {
    render(<TradingScreen {...baseProps} />);
    // Default shows Buy Yes payoff with best ask price
    expect(
      screen.getByText(/You pay .+\. You win \$1\.00 if AAPL closes/),
    ).toBeInTheDocument();
  });

  it("updates payoff when switching intent", async () => {
    render(<TradingScreen {...baseProps} />);
    const user = userEvent.setup();

    // Click Buy No to switch perspective
    await user.click(screen.getByRole("button", { name: /Buy No/i }));

    expect(
      screen.getByText(/You pay .+\. You win \$1\.00 if AAPL closes below/),
    ).toBeInTheDocument();
  });
});
