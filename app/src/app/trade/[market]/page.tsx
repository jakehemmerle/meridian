"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { TradingScreen } from "../../../features/trading/trading-screen";
import { useTradeExecution, type MarketAccounts } from "../../../features/trading/use-trade-execution";
import { useMarketAccount } from "../../../lib/solana/use-market-account";
import { useTokenBalances } from "../../../lib/solana/use-token-balance";
import { readPublicMeridianEnv } from "../../../lib/env/public";

const MERIDIAN_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];

function formatTokenAmount(amount: bigint): string {
  return (Number(amount) / 1_000_000).toFixed(2);
}

function getUsdcMint(): PublicKey {
  if (typeof window !== "undefined") {
    const e2eMint = (window as unknown as Record<string, string>).__E2E_USDC_MINT;
    if (e2eMint) return new PublicKey(e2eMint);
  }
  const env = readPublicMeridianEnv();
  return new PublicKey(env.usdcMint);
}

export default function TradePage() {
  const params = useParams<{ market: string }>();
  const { publicKey, connected, connect } = useWallet();

  const marketData = useMarketAccount(params.market);

  const usdcMint = getUsdcMint();

  const marketAccounts: MarketAccounts = marketData
    ? {
        marketPda: marketData.marketPda,
        phoenixMarket: marketData.phoenixMarket,
        configPda: marketData.configPda,
        vaultPda: marketData.vaultPda,
        yesMint: marketData.yesMint,
        noMint: marketData.noMint,
        usdcMint,
      }
    : {
        marketPda: PublicKey.default,
        phoenixMarket: PublicKey.default,
        configPda: PublicKey.default,
        vaultPda: PublicKey.default,
        yesMint: PublicKey.default,
        noMint: PublicKey.default,
        usdcMint: PublicKey.default,
      };

  const tradeExecution = useTradeExecution(marketAccounts);

  const balances = useTokenBalances(
    usdcMint,
    marketData?.yesMint ?? null,
    marketData?.noMint ?? null,
  );

  // Refresh balances after trade confirms
  useEffect(() => {
    if (tradeExecution.status === "confirmed") {
      const timer = setTimeout(() => balances.refresh(), 1000);
      return () => clearTimeout(timer);
    }
  }, [tradeExecution.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const ticker = marketData
    ? MERIDIAN_TICKERS[marketData.ticker] ?? "UNKNOWN"
    : "...";

  const handleIntent = (intent: Parameters<typeof tradeExecution.execute>[0]) => {
    if (!marketData) return;
    // Default quantity: 1 token (1_000_000 base lots)
    tradeExecution.execute(intent, 1_000_000n).catch(() => {
      // Error handled by hook state
    });
  };

  return (
    <div>
      {!connected && (
        <button onClick={() => connect()}>Connect Wallet</button>
      )}

      {connected && publicKey && (
        <span data-testid="wallet-address">
          {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
        </span>
      )}

      <div>
        <span data-testid="usdc-balance">{formatTokenAmount(balances.usdc)}</span>
        <span data-testid="yes-balance">{formatTokenAmount(balances.yes)}</span>
        <span data-testid="no-balance">{formatTokenAmount(balances.no)}</span>
      </div>

      {tradeExecution.status !== "idle" && (
        <span data-testid="tx-status">{tradeExecution.status}</span>
      )}

      {tradeExecution.error && (
        <span data-testid="tx-error">{tradeExecution.error}</span>
      )}

      {marketData && (
        <TradingScreen
          ticker={ticker}
          strikePriceMicros={Number(marketData.strikePrice)}
          yesLadder={null}
          noLadder={null}
          marketCloseUtc={marketData.closeTimeTs}
          position={null}
          onIntent={handleIntent}
        />
      )}
    </div>
  );
}
