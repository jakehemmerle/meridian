import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MarketsLandingPage } from "./view";

const mockConnect = vi.fn();
const mockWallet = {
  connected: false,
  connecting: false,
  connect: mockConnect,
  disconnect: vi.fn(),
  select: vi.fn(),
  publicKey: null,
  wallet: null,
  wallets: [],
  signTransaction: undefined,
  signAllTransactions: undefined,
  signMessage: undefined,
  sendTransaction: vi.fn(),
};

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => mockWallet,
}));

describe("MarketsLandingPage", () => {
  beforeEach(() => {
    mockWallet.connected = false;
    mockWallet.publicKey = null;
    mockConnect.mockClear();
  });

  it("renders product explanation text when disconnected", () => {
    render(<MarketsLandingPage />);
    expect(screen.getByText(/binary outcome/i)).toBeInTheDocument();
  });

  it("renders all seven MAG7 tickers before wallet connection", () => {
    render(<MarketsLandingPage />);
    for (const ticker of ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]) {
      expect(screen.getByText(ticker)).toBeInTheDocument();
    }
  });

  it("renders a connect-wallet button when disconnected", () => {
    render(<MarketsLandingPage />);
    expect(
      screen.getByRole("button", { name: /connect wallet/i }),
    ).toBeInTheDocument();
  });

  it("calls wallet.connect() when CTA button is clicked", async () => {
    render(<MarketsLandingPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("does not render connect-wallet button when already connected", () => {
    mockWallet.connected = true;
    mockWallet.publicKey = { toBase58: () => "ABC123" } as any;
    render(<MarketsLandingPage />);
    expect(
      screen.queryByRole("button", { name: /connect wallet/i }),
    ).not.toBeInTheDocument();
  });

  it("renders loading state for market data without crashing", () => {
    render(<MarketsLandingPage />);
    expect(screen.getByText(/loading markets/i)).toBeInTheDocument();
  });
});
