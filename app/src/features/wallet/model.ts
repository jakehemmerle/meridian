export interface WalletConnectionState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
}

export const disconnectedWalletState: WalletConnectionState = {
  address: null,
  isConnected: false,
  isConnecting: false,
};

export const connectingWalletState: WalletConnectionState = {
  address: null,
  isConnected: false,
  isConnecting: true,
};

export function connectedWalletState(address: string): WalletConnectionState {
  return { address, isConnected: true, isConnecting: false };
}
