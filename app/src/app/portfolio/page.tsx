"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { PortfolioPositionList } from "../../features/portfolio";
import { usePortfolioPositions } from "../../features/portfolio/use-portfolio";

export default function PortfolioPage() {
  const { connected, connect } = useWallet();
  const { positions, loading } = usePortfolioPositions();

  if (!connected) {
    return (
      <section className="panel">
        <h2>Portfolio</h2>
        <p>Connect your wallet to view positions.</p>
        <button type="button" onClick={() => connect()}>
          Connect Wallet
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Portfolio</h2>
        <p>Loading positions...</p>
      </section>
    );
  }

  return <PortfolioPositionList positions={positions} />;
}
