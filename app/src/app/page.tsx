"use client";

import { useState } from "react";
import type { MarketSummary } from "../features/markets/model";
import { MarketsLandingPage } from "../features/markets";
import { MarketTradingPage } from "../features/trading/market-trading-page";

export default function Page() {
  const [selectedMarket, setSelectedMarket] = useState<MarketSummary | null>(
    null,
  );

  if (selectedMarket) {
    return (
      <MarketTradingPage
        market={selectedMarket}
        onBack={() => setSelectedMarket(null)}
      />
    );
  }

  return <MarketsLandingPage onSelectMarket={setSelectedMarket} />;
}
