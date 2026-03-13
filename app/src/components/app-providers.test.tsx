import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppProviders } from "./app-providers";

function WalletProbe() {
  const wallet = useWallet();
  return (
    <span data-testid="probe">
      {wallet.connected !== undefined ? "context-available" : "no-context"}
    </span>
  );
}

describe("AppProviders", () => {
  it("provides wallet context to children without throwing", () => {
    render(
      <AppProviders>
        <WalletProbe />
      </AppProviders>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("context-available");
  });
});
