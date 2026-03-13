import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: vi.fn(),
}));

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletStatusPanel } from "./view";

const mockUseWallet = vi.mocked(useWallet);

describe("WalletStatusPanel", () => {
  it("shows Connect Wallet button when disconnected", () => {
    mockUseWallet.mockReturnValue({
      connected: false,
      connecting: false,
      publicKey: null,
    } as ReturnType<typeof useWallet>);

    render(<WalletStatusPanel />);
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });
});
