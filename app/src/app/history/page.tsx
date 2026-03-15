"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { HistoryList } from "../../features/history";
import { PageShell } from "../../components/page-shell";

export default function HistoryPage() {
  const { connected, connect } = useWallet();

  if (!connected) {
    return (
      <PageShell hero={<h1>History</h1>}>
        <section className="panel">
          <p>Connect your wallet to view trade history.</p>
          <button type="button" onClick={() => connect()}>
            Connect Wallet
          </button>
        </section>
      </PageShell>
    );
  }

  // MVP: Transaction history parsing is not yet implemented.
  // Full implementation would use connection.getSignaturesForAddress(wallet)
  // and parse Meridian program logs for Buy/Sell/Mint/Redeem events.
  return (
    <PageShell hero={<h1>History</h1>}>
      <HistoryList events={[]} />
    </PageShell>
  );
}
