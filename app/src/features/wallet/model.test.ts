import { describe, it, expect } from "vitest";
import {
  disconnectedWalletState,
  connectingWalletState,
  connectedWalletState,
} from "./model";

describe("wallet model helpers", () => {
  it("disconnectedWalletState has no address and is not connected", () => {
    expect(disconnectedWalletState.address).toBeNull();
    expect(disconnectedWalletState.isConnected).toBe(false);
    expect(disconnectedWalletState.isConnecting).toBe(false);
  });

  it("connectingWalletState is connecting but not connected", () => {
    expect(connectingWalletState.address).toBeNull();
    expect(connectingWalletState.isConnected).toBe(false);
    expect(connectingWalletState.isConnecting).toBe(true);
  });

  it("connectedWalletState creates state with given address", () => {
    const state = connectedWalletState("ABC123");
    expect(state.address).toBe("ABC123");
    expect(state.isConnected).toBe(true);
    expect(state.isConnecting).toBe(false);
  });
});
