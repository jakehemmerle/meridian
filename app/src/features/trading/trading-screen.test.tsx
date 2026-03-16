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
    expect(screen.getAllByText("Yes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No").length).toBeGreaterThan(0);
  });

  it("displays Yes-side bid/ask levels from the Yes ladder", () => {
    render(<TradingScreen {...baseProps} />);
    // Best Yes bid at $0.60
    expect(screen.getAllByText("$0.60").length).toBeGreaterThan(0);
    // Best Yes ask at $0.62
    expect(screen.getAllByText("$0.62").length).toBeGreaterThan(0);
  });

  it("displays No-side prices derived from the Yes book", () => {
    render(<TradingScreen {...baseProps} />);
    // No bids: inverted from Yes asks. Best No bid = $0.38
    expect(screen.getAllByText("$0.38").length).toBeGreaterThan(0);
    // No asks: inverted from Yes bids. Best No ask = $0.40
    expect(screen.getAllByText("$0.40").length).toBeGreaterThan(0);
  });

  // --- Trade ticket controls ---

  it("renders buy/sell and yes/no controls with a primary action", () => {
    render(<TradingScreen {...baseProps} />);
    expect(screen.getByRole("button", { name: /^Buy$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sell$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Yes$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^No$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Buy Yes/i })).toBeInTheDocument();
  });

  it("calls onIntent with the selected intent when the primary action is clicked", async () => {
    const onIntent = vi.fn();
    render(<TradingScreen {...baseProps} onIntent={onIntent} />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole("button", { name: /^No$/i })[0]);
    await user.click(screen.getByRole("button", { name: /Buy No/i }));
    expect(onIntent).toHaveBeenCalledWith("buy-no");
  });

  // --- Position-aware controls ---

  it("disables the primary action when selling Yes with no Yes position", async () => {
    render(<TradingScreen {...baseProps} position={null} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Sell$/i }));
    expect(screen.getByRole("button", { name: /Sell Yes/i })).toBeDisabled();
  });

  it("disables the primary action when selling No with no No position", async () => {
    render(<TradingScreen {...baseProps} position={null} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Sell$/i }));
    await user.click(screen.getAllByRole("button", { name: /^No$/i })[0]);
    expect(screen.getByRole("button", { name: /Sell No/i })).toBeDisabled();
  });

  it("enables Sell Yes when user holds Yes tokens", async () => {
    const position: UserPosition = { yesQuantity: 5n, noQuantity: 0n };
    render(<TradingScreen {...baseProps} position={position} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Sell$/i }));
    expect(screen.getByRole("button", { name: /Sell Yes/i })).toBeEnabled();
  });

  it("enables Sell No when user holds No tokens", async () => {
    const position: UserPosition = { yesQuantity: 0n, noQuantity: 3n };
    render(<TradingScreen {...baseProps} position={position} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Sell$/i }));
    await user.click(screen.getAllByRole("button", { name: /^No$/i })[0]);
    expect(screen.getByRole("button", { name: /Sell No/i })).toBeEnabled();
  });

  it("shows guidance text for disabled sell actions", async () => {
    render(<TradingScreen {...baseProps} position={null} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Sell$/i }));
    expect(screen.getByText("You need Yes tokens to sell.")).toBeInTheDocument();
  });

  // --- Buy position constraints ---

  it("disables Buy Yes when user holds No tokens", () => {
    const position: UserPosition = { yesQuantity: 0n, noQuantity: 5n };
    render(<TradingScreen {...baseProps} position={position} />);
    expect(screen.getByRole("button", { name: /Buy Yes/i })).toBeDisabled();
  });

  it("disables Buy No when user holds Yes tokens", async () => {
    const position: UserPosition = { yesQuantity: 5n, noQuantity: 0n };
    render(<TradingScreen {...baseProps} position={position} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /^No$/i })[0]);
    expect(screen.getByRole("button", { name: /Buy No/i })).toBeDisabled();
  });

  it("shows buy guidance text when buy is constrained", async () => {
    const position: UserPosition = { yesQuantity: 5n, noQuantity: 0n };
    render(<TradingScreen {...baseProps} position={position} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /^No$/i })[0]);
    expect(screen.getByText("Sell your Yes tokens first.")).toBeInTheDocument();
  });

  it("re-checks constraints after intent callback", async () => {
    const position: UserPosition = { yesQuantity: 0n, noQuantity: 5n };
    const onIntent = vi.fn();
    render(<TradingScreen {...baseProps} position={position} onIntent={onIntent} />);
    const user = userEvent.setup();

    // Buy Yes is disabled due to holding No tokens
    expect(screen.getByRole("button", { name: /Buy Yes/i })).toBeDisabled();

    // Sell No is enabled — clicking it triggers onIntent
    await user.click(screen.getByRole("button", { name: /^Sell$/i }));
    await user.click(screen.getAllByRole("button", { name: /^No$/i })[0]);
    await user.click(screen.getByRole("button", { name: /Sell No/i }));
    expect(onIntent).toHaveBeenCalledWith("sell-no");

    // Constraints are still applied (position hasn't changed in props)
    await user.click(screen.getByRole("button", { name: /^Buy$/i }));
    await user.click(screen.getAllByRole("button", { name: /^Yes$/i })[0]);
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

  it("does not call onIntent when clicking a disabled Sell Yes button", async () => {
    const onIntent = vi.fn();
    render(<TradingScreen {...baseProps} position={null} onIntent={onIntent} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Sell$/i }));
    const sellYesBtn = screen.getByRole("button", { name: /Sell Yes/i });
    expect(sellYesBtn).toBeDisabled();

    await user.click(sellYesBtn);
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("enables both sell buttons and shows no guidance when holding both Yes and No", () => {
    const position: UserPosition = { yesQuantity: 5n, noQuantity: 3n };
    render(<TradingScreen {...baseProps} position={position} />);

    expect(screen.queryByText("You need Yes tokens to sell.")).not.toBeInTheDocument();
    expect(screen.queryByText("You need No tokens to sell.")).not.toBeInTheDocument();
  });

  it("updates payoff when switching intent", async () => {
    render(<TradingScreen {...baseProps} />);
    const user = userEvent.setup();

    // Click Buy No to switch perspective
    await user.click(screen.getAllByRole("button", { name: /^No$/i })[0]);

    expect(
      screen.getByText(/You pay .+\. You win \$1\.00 if AAPL closes below/),
    ).toBeInTheDocument();
  });
});
