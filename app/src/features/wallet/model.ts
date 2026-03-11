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
