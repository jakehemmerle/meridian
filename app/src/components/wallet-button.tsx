"use client";

import { Button } from "@radix-ui/themes";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const { connected, connecting, disconnect, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <Button
        type="button"
        variant="soft"
        color="gray"
        onClick={() => {
          disconnect().catch(() => {});
        }}
      >
        {truncateAddress(publicKey.toBase58())}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => setVisible(true)}
      disabled={connecting}
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </Button>
  );
}
