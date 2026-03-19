import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MarketsLandingPage } from "./view";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("./use-market-list", () => ({
  useMarketList: vi.fn(),
}));

vi.mock("./use-ticker-snapshots", () => ({
  useTickerSnapshots: vi.fn(),
  getTickerSnapshot: vi.fn().mockReturnValue(null),
}));

vi.mock("./use-market-quotes", () => ({
  useMarketQuotes: vi.fn(),
}));

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

const mockConnection = {
  getProgramAccounts: vi.fn().mockResolvedValue([]),
  onAccountChange: vi.fn().mockReturnValue(0),
  removeAccountChangeListener: vi.fn(),
};

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => mockWallet,
  useConnection: () => ({ connection: mockConnection }),
  useAnchorWallet: () => undefined,
}));

const mockSetVisible = vi.fn();

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({ setVisible: mockSetVisible }),
}));

import { useMarketList } from "./use-market-list";
import { useTickerSnapshots } from "./use-ticker-snapshots";
import { useMarketQuotes } from "./use-market-quotes";

const mockUseMarketList = vi.mocked(useMarketList);
const mockUseTickerSnapshots = vi.mocked(useTickerSnapshots);
const mockUseMarketQuotes = vi.mocked(useMarketQuotes);

describe("MarketsLandingPage", () => {
  beforeEach(() => {
    mockWallet.connected = false;
    mockWallet.publicKey = null;
    mockConnect.mockClear();
    mockSetVisible.mockClear();
    mockUseMarketList.mockReturnValue({
      markets: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockUseTickerSnapshots.mockReturnValue({
      snapshots: {},
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockUseMarketQuotes.mockReturnValue({
      quotes: {},
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it("renders product explanation text when disconnected", () => {
    render(<MarketsLandingPage />);
    expect(
      screen.getByRole("heading", {
        name: /binary outcome markets for the closing bell/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders a connect-wallet prompt when disconnected", () => {
    render(<MarketsLandingPage />);
    expect(
      screen.getByRole("button", { name: /connect wallet/i }),
    ).toBeInTheDocument();
  });

  it("renders public stock discovery while disconnected", () => {
    render(<MarketsLandingPage />);
    expect(screen.getByRole("heading", { name: /browse by stock/i })).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();
  });

  it("does not render connect-wallet button when already connected", () => {
    mockWallet.connected = true;
    mockWallet.publicKey = { toBase58: () => "ABC123" } as any;
    render(<MarketsLandingPage />);
    expect(
      screen.queryByRole("button", { name: /connect wallet/i }),
    ).not.toBeInTheDocument();
  });

  it("renders empty market list when connected with no program", async () => {
    mockWallet.connected = true;
    mockWallet.publicKey = { toBase58: () => "ABC123" } as any;
    render(<MarketsLandingPage />);
    expect(screen.getByText(/no markets available/i)).toBeInTheDocument();
  });
});
