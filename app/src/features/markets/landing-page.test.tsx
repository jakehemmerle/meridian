import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MarketsLandingPage } from "./view";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
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

  it("renders a connect-wallet prompt when disconnected", () => {
    render(<MarketsLandingPage />);
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
  });

  it("does not render market rows while disconnected", () => {
    render(<MarketsLandingPage />);
    expect(
      screen.queryByText(/no markets available/i),
    ).not.toBeInTheDocument();
  });

  it("does not render connect-wallet button when already connected", () => {
    mockWallet.connected = true;
    mockWallet.publicKey = { toBase58: () => "ABC123" } as any;
    render(<MarketsLandingPage />);
    expect(
      screen.queryByRole("button", { name: /connect wallet/i }),
    ).not.toBeInTheDocument();
  });

  it("renders empty market list when connected with no program", () => {
    mockWallet.connected = true;
    mockWallet.publicKey = { toBase58: () => "ABC123" } as any;
    render(<MarketsLandingPage />);
    expect(screen.getByText(/no markets available/i)).toBeInTheDocument();
  });
});
