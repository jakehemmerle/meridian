import { PublicKey } from "@solana/web3.js";
import { BN, type Program } from "@coral-xyz/anchor";

export interface DiscoveredMarket {
  pda: PublicKey;
  phase: "trading" | "closed" | "settled";
  outcome: "unsettled" | "yes" | "no";
  phoenixMarket: PublicKey;
  strikePrice: BN;
  tradingDay: number;
  ticker: number;
  yesOpenInterest: BN;
  noOpenInterest: BN;
}

function phaseToString(phase: Record<string, unknown>): "trading" | "closed" | "settled" {
  if ("trading" in phase) return "trading";
  if ("closed" in phase) return "closed";
  if ("settled" in phase) return "settled";
  throw new Error(`Unknown phase: ${JSON.stringify(phase)}`);
}

function outcomeToString(outcome: Record<string, unknown>): "unsettled" | "yes" | "no" {
  if ("unsettled" in outcome) return "unsettled";
  if ("yes" in outcome) return "yes";
  if ("no" in outcome) return "no";
  throw new Error(`Unknown outcome: ${JSON.stringify(outcome)}`);
}

function tickerToNumber(ticker: Record<string, unknown>): number {
  const entries = Object.keys(ticker);
  const tickerMap: Record<string, number> = {
    aapl: 0, msft: 1, googl: 2, amzn: 3, nvda: 4, meta: 5, tsla: 6,
  };
  const key = entries[0]?.toLowerCase();
  if (key !== undefined && key in tickerMap) return tickerMap[key];
  throw new Error(`Unknown ticker: ${JSON.stringify(ticker)}`);
}

export async function discoverMarkets(program: Program): Promise<DiscoveredMarket[]> {
  const accounts = await (program.account as any).meridianMarket.all();
  return accounts.map((acc: any) => ({
    pda: acc.publicKey,
    phase: phaseToString(acc.account.phase),
    outcome: outcomeToString(acc.account.outcome),
    phoenixMarket: acc.account.phoenixMarket,
    strikePrice: acc.account.strikePrice,
    tradingDay: acc.account.tradingDay,
    ticker: tickerToNumber(acc.account.ticker),
    yesOpenInterest: acc.account.yesOpenInterest,
    noOpenInterest: acc.account.noOpenInterest,
  }));
}
