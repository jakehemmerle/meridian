"use client";

import { useParams } from "next/navigation";

import { StockMarketsPage } from "../../../features/markets/view";

export default function TickerMarketsPage() {
  const params = useParams<{ ticker: string }>();

  return <StockMarketsPage ticker={params.ticker} />;
}
