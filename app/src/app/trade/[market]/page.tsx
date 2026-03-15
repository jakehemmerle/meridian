"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";

import { TradingScreen } from "../../../features/trading/trading-screen";
import { useTradeExecution, type MarketAccounts } from "../../../features/trading/use-trade-execution";
import { type TradeIntent } from "../../../features/trading/model";
import { useOrderBook } from "../../../features/trading/use-orderbook";
import { useUserPosition } from "../../../features/trading/use-position";
import { useMarketAccount } from "../../../lib/solana/use-market-account";
import { useTokenBalances } from "../../../lib/solana/use-token-balance";
import { formatTokenAmount } from "../../../lib/format";
import { getUsdcMint } from "../../../lib/usdc-mint";
import { PageShell } from "../../../components/page-shell";

const MERIDIAN_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];

export default function TradePage() {
  const params = useParams<{ market: string }>();
  const { publicKey, connected } = useWallet();

  const marketData = useMarketAccount(params.market);

  const usdcMint = useMemo(() => getUsdcMint(), []);

  const marketAccounts: MarketAccounts = useMemo(
    () =>
      marketData
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
          },
    [marketData, usdcMint],
  );

  const tradeExecution = useTradeExecution(marketAccounts);

  // Wire orderbook via Phoenix WebSocket subscription
  const phoenixMarketAddress = marketData
    ? marketData.phoenixMarket.toBase58()
    : null;
  const { yesLadder, noLadder } = useOrderBook(phoenixMarketAddress);

  // Wire user position from on-chain token balances
  const { position, refresh: refreshPosition } = useUserPosition(params.market);

  const balances = useTokenBalances(
    usdcMint,
    marketData?.yesMint ?? null,
    marketData?.noMint ?? null,
  );

  // Refresh balances and position after trade confirms
  useEffect(() => {
    if (tradeExecution.status === "confirmed") {
      const timer = setTimeout(() => {
        balances.refresh();
        refreshPosition();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [tradeExecution.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const ticker = marketData
    ? MERIDIAN_TICKERS[marketData.ticker] ?? "UNKNOWN"
    : "...";

  // Quantity input state (in base lots, 1 token = 1_000_000)
  const [quantityTokens, setQuantityTokens] = useState(1);

  const handleIntent = (intent: TradeIntent) => {
    if (!marketData) return;
    const quantityBaseLots = BigInt(quantityTokens) * 1_000_000n;
    tradeExecution.execute(intent, quantityBaseLots).catch(() => {
      // Error handled by hook state
    });
  };

  return (
    <PageShell
      hero={
        <header>
          <h1>{ticker} Market</h1>
        </header>
      }
    >
      {!connected && (
        <section className="panel">
          <p>Connect your wallet to trade.</p>
          <WalletMultiButton />
        </section>
      )}

      {connected && publicKey && (
        <div>
          <div className="balances">
            <span data-testid="wallet-address">
              {publicKey.toBase58().replace(/^(.{4}).+(.{4})$/, "$1...$2")}
            </span>
            <span data-testid="usdc-balance">USDC: {formatTokenAmount(balances.usdc)}</span>
            <span data-testid="yes-balance">Yes: {formatTokenAmount(balances.yes)}</span>
            <span data-testid="no-balance">No: {formatTokenAmount(balances.no)}</span>
          </div>

          {tradeExecution.status !== "idle" && (
            <span data-testid="tx-status">{tradeExecution.status}</span>
          )}

          {tradeExecution.error && (
            <span data-testid="tx-error">{tradeExecution.error}</span>
          )}

          {/* Quantity input */}
          <div className="quantity-input">
            <label htmlFor="trade-quantity">Quantity (tokens)</label>
            <input
              id="trade-quantity"
              type="number"
              min={1}
              value={quantityTokens}
              onChange={(e) => setQuantityTokens(Math.max(1, parseInt(e.target.value) || 1))}
              data-testid="quantity-input"
            />
            <button
              type="button"
              onClick={() => {
                // Max based on USDC balance (each token costs up to $1)
                const maxTokens = Math.floor(Number(balances.usdc) / 1_000_000);
                if (maxTokens > 0) setQuantityTokens(maxTokens);
              }}
              data-testid="max-button"
            >
              Max
            </button>
          </div>

          {marketData && (
            <TradingScreen
              ticker={ticker}
              strikePriceMicros={Number(marketData.strikePrice)}
              yesLadder={yesLadder}
              noLadder={noLadder}
              marketCloseUtc={marketData.closeTimeTs}
              position={position}
              onIntent={handleIntent}
            />
          )}

          {!marketData && (
            <section className="panel">
              <p>Loading market data...</p>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
