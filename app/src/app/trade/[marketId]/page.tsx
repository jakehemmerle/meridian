"use client";

import { use } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserPosition } from "../../../features/trading/use-position";

const PRICE_UNIT = 1_000_000;

function formatQuantity(micros: bigint): string {
  return (Number(micros) / PRICE_UNIT).toString();
}

export default function TradePage({
  params,
}: {
  params: Promise<{ marketId: string }>;
}) {
  const { marketId } = use(params);
  const { connected, connect } = useWallet();
  const { position, loading } = useUserPosition(connected ? marketId : null);

  if (!connected) {
    return (
      <section className="panel">
        <h2>Trade</h2>
        <p>Connect your wallet to trade.</p>
        <button type="button" onClick={() => connect()}>
          Connect Wallet
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Trade</h2>
      {loading && <p>Loading position...</p>}
      {position && (
        <div>
          <p data-testid="position-yes">
            Yes: {formatQuantity(position.yesQuantity)}
          </p>
          <p data-testid="position-no">
            No: {formatQuantity(position.noQuantity)}
          </p>
        </div>
      )}
      {!loading && !position && (
        <p>No position in this market.</p>
      )}
    </section>
  );
}
