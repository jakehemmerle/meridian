"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "../../components/wallet-button";
import { HistoryList } from "../../features/history";
import { useHistoryEvents } from "../../features/history/use-history";
import { PageShell } from "../../components/page-shell";

export default function HistoryPage() {
  const { connected } = useWallet();
  const { events, loading, error } = useHistoryEvents();
  const hero = (
    <section className="pageHero">
      <h1>History</h1>
      <p>Recent trades and redemptions for the connected wallet on Meridian devnet.</p>
    </section>
  );

  if (!connected) {
    return (
      <PageShell hero={hero}>
        <section className="panel">
          <p>Connect your wallet to view trade history.</p>
          <WalletButton />
        </section>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell hero={hero}>
        <section className="panel">
          <p>Loading history...</p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell hero={hero}>
      {error ? (
        <section className="panel">
          <h2>History</h2>
          <p>{error}</p>
        </section>
      ) : (
        <HistoryList events={events} />
      )}
    </PageShell>
  );
}
