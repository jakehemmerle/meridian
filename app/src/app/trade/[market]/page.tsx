"use client";

import { useParams } from "next/navigation";

export default function TradePage() {
  const params = useParams<{ market: string }>();

  return (
    <div>
      <h1>Trade</h1>
      <p>Market: {params.market}</p>
    </div>
  );
}
