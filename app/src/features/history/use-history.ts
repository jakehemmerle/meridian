"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
  TokenBalance,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { readPublicMeridianEnv } from "../../lib/env/public";
import {
  deserializeMeridianMarket,
  MERIDIAN_MARKET_ACCOUNT_SIZE,
} from "../../lib/solana/market-account";
import { MERIDIAN_PROGRAM_ID } from "../../lib/solana/program";
import { PRICE_UNIT } from "../../lib/format";
import type { HistoryEvent, TradeEvent } from "./model";

const MAX_SIGNATURES = 40;

interface MarketHistoryMetadata {
  marketId: string;
  ticker: string;
  yesMint: string;
  noMint: string;
}

function getTickerName(index: number): string {
  return ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"][index] ?? "AAPL";
}

function buildOwnedMintBalances(
  balances: TokenBalance[] | null | undefined,
  owner: string,
): Map<string, bigint> {
  const amounts = new Map<string, bigint>();

  for (const balance of balances ?? []) {
    if (balance.owner !== owner) continue;
    const nextAmount = BigInt(balance.uiTokenAmount.amount);
    amounts.set(balance.mint, (amounts.get(balance.mint) ?? 0n) + nextAmount);
  }

  return amounts;
}

function getMintDelta(
  preBalances: Map<string, bigint>,
  postBalances: Map<string, bigint>,
  mint: string,
): bigint {
  return (postBalances.get(mint) ?? 0n) - (preBalances.get(mint) ?? 0n);
}

function classifyTradeEvent(
  market: MarketHistoryMetadata,
  usdcDelta: bigint,
  yesDelta: bigint,
  noDelta: bigint,
  timestampMs: number,
  signature: string,
): TradeEvent | null {
  if (yesDelta > 0n && usdcDelta < 0n) {
    return {
      type: "trade",
      ticker: market.ticker,
      marketId: market.marketId,
      side: "buy-yes",
      quantity: Number(yesDelta / BigInt(PRICE_UNIT)),
      priceMicros: Number((-usdcDelta) / (yesDelta / BigInt(PRICE_UNIT))),
      timestampMs,
      signature,
    };
  }

  if (yesDelta < 0n && usdcDelta > 0n) {
    return {
      type: "trade",
      ticker: market.ticker,
      marketId: market.marketId,
      side: "sell-yes",
      quantity: Number((-yesDelta) / BigInt(PRICE_UNIT)),
      priceMicros: Number(usdcDelta / ((-yesDelta) / BigInt(PRICE_UNIT))),
      timestampMs,
      signature,
    };
  }

  if (noDelta > 0n && usdcDelta < 0n) {
    return {
      type: "trade",
      ticker: market.ticker,
      marketId: market.marketId,
      side: "buy-no",
      quantity: Number(noDelta / BigInt(PRICE_UNIT)),
      priceMicros: Number((-usdcDelta) / (noDelta / BigInt(PRICE_UNIT))),
      timestampMs,
      signature,
    };
  }

  if (noDelta < 0n && usdcDelta > 0n) {
    return {
      type: "trade",
      ticker: market.ticker,
      marketId: market.marketId,
      side: "sell-no",
      quantity: Number((-noDelta) / BigInt(PRICE_UNIT)),
      priceMicros: Number(usdcDelta / ((-noDelta) / BigInt(PRICE_UNIT))),
      timestampMs,
      signature,
    };
  }

  return null;
}

function parseHistoryEvent(
  tx: ParsedTransactionWithMeta,
  sig: ConfirmedSignatureInfo,
  owner: string,
  usdcMint: string,
  markets: MarketHistoryMetadata[],
): HistoryEvent | null {
  if (!tx.meta || tx.meta.err) return null;

  const logs = tx.meta.logMessages ?? [];
  const blockTimeMs = (sig.blockTime ?? tx.blockTime ?? 0) * 1000;
  const preBalances = buildOwnedMintBalances(tx.meta.preTokenBalances, owner);
  const postBalances = buildOwnedMintBalances(tx.meta.postTokenBalances, owner);
  const usdcDelta = getMintDelta(preBalances, postBalances, usdcMint);

  const market = markets.find((candidate) => {
    const yesDelta = getMintDelta(preBalances, postBalances, candidate.yesMint);
    const noDelta = getMintDelta(preBalances, postBalances, candidate.noMint);
    return yesDelta !== 0n || noDelta !== 0n;
  });

  if (!market) return null;

  const yesDelta = getMintDelta(preBalances, postBalances, market.yesMint);
  const noDelta = getMintDelta(preBalances, postBalances, market.noMint);

  if (logs.some((line) => line.includes("Instruction: Redeem")) && usdcDelta > 0n) {
    const burnedQuantity = yesDelta < 0n ? -yesDelta : noDelta < 0n ? -noDelta : 0n;
    return {
      type: "redeem",
      ticker: market.ticker,
      marketId: market.marketId,
      payoutMicros: Number(usdcDelta),
      quantity: Number(burnedQuantity / BigInt(PRICE_UNIT)),
      timestampMs: blockTimeMs,
      signature: sig.signature,
    };
  }

  if (logs.some((line) => line.includes("Instruction: TradeYes"))) {
    return classifyTradeEvent(
      market,
      usdcDelta,
      yesDelta,
      noDelta,
      blockTimeMs,
      sig.signature,
    );
  }

  return null;
}

export interface UseHistoryResult {
  events: HistoryEvent[];
  loading: boolean;
  error: string | null;
}

export function useHistoryEvents(): UseHistoryResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchHistory = useCallback(async () => {
    if (!publicKey) {
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const owner = publicKey.toBase58();
      const usdcMint = readPublicMeridianEnv().usdcMint;
      const marketAccounts = await connection.getProgramAccounts(MERIDIAN_PROGRAM_ID, {
        filters: [{ dataSize: MERIDIAN_MARKET_ACCOUNT_SIZE }],
      });

      const markets: MarketHistoryMetadata[] = marketAccounts.map(({ pubkey, account }) => {
        const market = deserializeMeridianMarket(account.data);
        return {
          marketId: pubkey.toBase58(),
          ticker: market.ticker,
          yesMint: market.yesMint.toBase58(),
          noMint: market.noMint.toBase58(),
        };
      });

      const signatures = await connection.getSignaturesForAddress(publicKey, {
        limit: MAX_SIGNATURES,
      });
      const parsed = await connection.getParsedTransactions(
        signatures.map((signature) => signature.signature),
        { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      );

      const nextEvents = parsed
        .map((tx, index) => {
          if (!tx) return null;
          return parseHistoryEvent(tx, signatures[index], owner, usdcMint, markets);
        })
        .filter((event): event is HistoryEvent => event !== null);

      if (mountedRef.current) {
        setEvents(nextEvents);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [connection, publicKey]);

  useEffect(() => {
    mountedRef.current = true;
    fetchHistory();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchHistory]);

  return { events, loading, error };
}
