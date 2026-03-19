"use client";

import { Card, Flex, Text } from "@radix-ui/themes";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "../../components/wallet-button";

function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletStatusPanel() {
  const { connected, connecting, publicKey } = useWallet();

  if (connecting) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Text size="2" weight="bold">
            Wallet
          </Text>
          <Text size="2" color="gray">
            Connecting...
          </Text>
        </Flex>
      </Card>
    );
  }

  if (connected && publicKey) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Text size="2" weight="bold">
            Wallet
          </Text>
          <Text size="2" data-testid="wallet-address">
            {truncateAddress(publicKey.toBase58())}
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Card>
      <Flex direction="column" gap="3" align="start">
        <Text size="2" weight="bold">
          Wallet
        </Text>
        <WalletButton />
      </Flex>
    </Card>
  );
}
