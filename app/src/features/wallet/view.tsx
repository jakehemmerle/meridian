"use client";

import { useWallet } from "@solana/wallet-adapter-react";

function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletStatusPanel() {
  const { connected, connecting, publicKey } = useWallet();

  if (connecting) {
    return (
      <section className="panel">
        <h2>Wallet</h2>
        <p>Connecting...</p>
      </section>
    );
  }

  if (connected && publicKey) {
    return (
      <section className="panel">
        <h2>Wallet</h2>
        <p data-testid="wallet-address">{truncateAddress(publicKey.toBase58())}</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Wallet</h2>
      <p>Connect Wallet</p>
    </section>
  );
}
