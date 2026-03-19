"use client";

import { useEffect, useState } from "react";
import { Button } from "@radix-ui/themes";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  const { connected, connecting, connect, disconnect, publicKey, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <Button type="button">Connect Wallet</Button>;
  }

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

  async function handleConnect(): Promise<void> {
    if (!wallet) {
      setVisible(true);
      return;
    }

    try {
      await connect();
    } catch {
      setVisible(true);
    }
  }

  return (
    <Button
      type="button"
      onClick={() => {
        void handleConnect();
      }}
      disabled={connecting}
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </Button>
  );
}
