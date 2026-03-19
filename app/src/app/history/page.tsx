"use client";

import { Card, Text } from "@radix-ui/themes";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "../../components/wallet-button";
import { HistoryList } from "../../features/history";
import { useHistoryEvents } from "../../features/history/use-history";
import { PageShell } from "../../components/page-shell";

export default function HistoryPage() {
  const { connected } = useWallet();
  const { events, loading, error } = useHistoryEvents();
  const hero = (
    <Card className="hero-card">
      <Text size="1" color="gray">
        HISTORY
      </Text>
      <h1 className="page-title">Execution history</h1>
      <p className="page-copy">
        Recent trades and redemptions for the connected wallet on Meridian devnet.
      </p>
    </Card>
  );

  if (!connected) {
    return (
      <PageShell hero={hero}>
        <Card>
          <p className="page-copy">Connect your wallet to view trade history.</p>
          <WalletButton />
        </Card>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell hero={hero}>
        <Card>
          <p className="page-copy">Loading history...</p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell hero={hero}>
      {error ? (
        <Card>
          <p className="page-copy">{error}</p>
        </Card>
      ) : (
        <HistoryList events={events} />
      )}
    </PageShell>
  );
}
