import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PortfolioPositionList, RedeemPanel } from "./view";
import type { PortfolioPosition } from "./model";

const TEN_TOKENS = 10_000_000n;
const FIVE_TOKENS = 5_000_000n;

describe("PortfolioPositionList", () => {
  it("shows empty portfolio message when positions array is empty", () => {
    render(<PortfolioPositionList positions={[]} />);
    expect(screen.getByText(/no active positions/i)).toBeInTheDocument();
  });

  it("renders a row for each position with ticker and side label", () => {
    const positions: PortfolioPosition[] = [
      {
        marketId: "m1",
        ticker: "AAPL",
        side: "yes",
        quantity: TEN_TOKENS,
        averageEntryPriceMicros: 600_000n,
        markPriceMicros: 750_000n,
      },
    ];
    render(<PortfolioPositionList positions={positions} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText(/yes/i)).toBeInTheDocument();
  });

  it("displays quantity for each position", () => {
    const positions: PortfolioPosition[] = [
      {
        marketId: "m1",
        ticker: "AAPL",
        side: "yes",
        quantity: TEN_TOKENS,
        averageEntryPriceMicros: 600_000n,
        markPriceMicros: 750_000n,
      },
    ];
    render(<PortfolioPositionList positions={positions} />);
    expect(screen.getByText("10.00")).toBeInTheDocument();
  });

  it("shows positive P&L when mark price exceeds entry price", () => {
    const positions: PortfolioPosition[] = [
      {
        marketId: "m1",
        ticker: "AAPL",
        side: "yes",
        quantity: TEN_TOKENS,
        averageEntryPriceMicros: 600_000n,
        markPriceMicros: 750_000n,
      },
    ];
    render(<PortfolioPositionList positions={positions} />);
    expect(screen.getByText(/\+\$1\.50/)).toBeInTheDocument();
  });

  it("shows negative P&L when mark price is below entry price", () => {
    const positions: PortfolioPosition[] = [
      {
        marketId: "m1",
        ticker: "AAPL",
        side: "yes",
        quantity: FIVE_TOKENS,
        averageEntryPriceMicros: 600_000n,
        markPriceMicros: 400_000n,
      },
    ];
    render(<PortfolioPositionList positions={positions} />);
    expect(screen.getByText(/-\$1\.00/)).toBeInTheDocument();
  });

  it("shows 'Unavailable' for P&L when mark price is not available", () => {
    const positions: PortfolioPosition[] = [
      {
        marketId: "m1",
        ticker: "AAPL",
        side: "yes",
        quantity: TEN_TOKENS,
        averageEntryPriceMicros: 600_000n,
        markPriceMicros: null,
      },
    ];
    render(<PortfolioPositionList positions={positions} />);
    expect(screen.getByTestId("pnl")).toHaveTextContent("Unavailable");
  });
});

describe("RedeemPanel", () => {
  it("does not show Redeem button for unsettled market", () => {
    render(
        <RedeemPanel
          marketPhase="Trading"
          marketOutcome="Unsettled"
          userSide="yes"
          quantity={FIVE_TOKENS}
          onRedeem={vi.fn()}
        />,
    );
    expect(
      screen.queryByRole("button", { name: /redeem/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show Redeem button when user holds losing token", () => {
    render(
        <RedeemPanel
          marketPhase="Settled"
          marketOutcome="Yes"
          userSide="no"
          quantity={FIVE_TOKENS}
          onRedeem={vi.fn()}
        />,
    );
    expect(
      screen.queryByRole("button", { name: /redeem/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no payout/i)).toBeInTheDocument();
  });

  it("shows Redeem button when user holds winning token", () => {
    render(
        <RedeemPanel
          marketPhase="Settled"
          marketOutcome="Yes"
          userSide="yes"
          quantity={FIVE_TOKENS}
          onRedeem={vi.fn()}
        />,
    );
    expect(
      screen.getByRole("button", { name: /redeem/i }),
    ).toBeInTheDocument();
  });

  it("calls onRedeem with position quantity when clicked", async () => {
    const onRedeem = vi.fn();
    render(
        <RedeemPanel
          marketPhase="Settled"
          marketOutcome="Yes"
          userSide="yes"
          quantity={FIVE_TOKENS}
          onRedeem={onRedeem}
        />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /redeem/i }));
    expect(onRedeem).toHaveBeenCalledWith(5n);
  });

  it("disables Redeem button while transaction pending", () => {
    render(
        <RedeemPanel
          marketPhase="Settled"
          marketOutcome="Yes"
          userSide="yes"
          quantity={FIVE_TOKENS}
          pending={true}
          onRedeem={vi.fn()}
        />,
    );
    expect(screen.getByRole("button", { name: /redeem/i })).toBeDisabled();
  });

  it("shows expected payout amount", () => {
    render(
        <RedeemPanel
          marketPhase="Settled"
          marketOutcome="Yes"
          userSide="yes"
          quantity={FIVE_TOKENS}
          onRedeem={vi.fn()}
        />,
    );
    expect(screen.getByText(/\$5\.00/)).toBeInTheDocument();
  });
});
