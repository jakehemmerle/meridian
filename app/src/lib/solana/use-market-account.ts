import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";

import { getMeridianProgram } from "./program";

export interface MarketAccountData {
  configPda: PublicKey;
  marketPda: PublicKey;
  vaultPda: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  phoenixMarket: PublicKey;
  phase: "Trading" | "Closed" | "Settled";
  outcome: "Unsettled" | "Yes" | "No";
  closeTimeTs: number;
  strikePrice: bigint;
  ticker: number;
  tradingDay: number;
}

export function useMarketAccount(
  marketAddress: string | null,
): MarketAccountData | null {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [data, setData] = useState<MarketAccountData | null>(null);

  useEffect(() => {
    if (!marketAddress || !anchorWallet) return;

    let cancelled = false;

    async function fetchMarket() {
      try {
        const marketPda = new PublicKey(marketAddress!);
        const program = getMeridianProgram(connection, anchorWallet!);

        const marketAccount = await (program.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>).meridianMarket.fetch(marketPda);

        if (cancelled) return;

        // Extract phase enum variant name
        const phaseObj = marketAccount.phase as Record<string, unknown>;
        const phase = Object.keys(phaseObj)[0] as "Trading" | "Closed" | "Settled";
        const capitalPhase =
          phase.charAt(0).toUpperCase() + phase.slice(1) as MarketAccountData["phase"];

        const outcomeObj = marketAccount.outcome as Record<string, unknown>;
        const outcome = Object.keys(outcomeObj)[0] as string;
        const capitalOutcome =
          outcome.charAt(0).toUpperCase() + outcome.slice(1) as MarketAccountData["outcome"];

        // Extract ticker index
        const tickerObj = marketAccount.ticker as Record<string, unknown>;
        const tickerName = Object.keys(tickerObj)[0];
        const tickerMap: Record<string, number> = {
          aapl: 0, msft: 1, googl: 2, amzn: 3, nvda: 4, meta: 5, tsla: 6,
        };

        setData({
          configPda: marketAccount.config as PublicKey,
          marketPda,
          vaultPda: marketAccount.vault as PublicKey,
          yesMint: marketAccount.yesMint as PublicKey,
          noMint: marketAccount.noMint as PublicKey,
          phoenixMarket: marketAccount.phoenixMarket as PublicKey,
          phase: capitalPhase,
          outcome: capitalOutcome,
          closeTimeTs: (marketAccount.closeTimeTs as { toNumber: () => number }).toNumber(),
          strikePrice: BigInt(
            (marketAccount.strikePrice as { toString: () => string }).toString(),
          ),
          ticker: tickerMap[tickerName] ?? 0,
          tradingDay: marketAccount.tradingDay as number,
        });
      } catch (err) {
        console.error("Failed to fetch market account:", err);
      }
    }

    fetchMarket();
    return () => {
      cancelled = true;
    };
  }, [marketAddress, connection, anchorWallet]);

  return data;
}
