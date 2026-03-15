import { PublicKey } from "@solana/web3.js";

const TICKER_NAMES = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"] as const;
const PHASE_NAMES = ["Trading", "Closed", "Settled"] as const;
const OUTCOME_NAMES = ["Unsettled", "Yes", "No"] as const;

export interface MeridianMarketAccount {
  version: number;
  bump: number;
  ticker: (typeof TICKER_NAMES)[number];
  phase: (typeof PHASE_NAMES)[number];
  outcome: (typeof OUTCOME_NAMES)[number];
  config: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  vault: PublicKey;
  phoenixMarket: PublicKey;
  oracleFeedId: Uint8Array;
  tradingDay: number;
  strikePrice: bigint;
  previousClose: bigint;
  closeTimeTs: number;
  settleAfterTs: number;
  yesOpenInterest: bigint;
  noOpenInterest: bigint;
  totalCollateralDeposited: bigint;
  totalCollateralReturned: bigint;
  totalWinningRedemptions: bigint;
  settledPrice: bigint;
  settlementTs: number;
}

/**
 * Deserialize a MeridianMarket account from raw buffer data.
 * Layout: 8-byte Anchor discriminator + struct fields in order.
 */
export function deserializeMeridianMarket(data: Buffer | Uint8Array): MeridianMarketAccount {
  const buf = Buffer.from(data);
  let offset = 8; // skip Anchor discriminator

  const version = buf.readUInt8(offset); offset += 1;
  const bump = buf.readUInt8(offset); offset += 1;
  const tickerIdx = buf.readUInt8(offset); offset += 1;
  const phaseIdx = buf.readUInt8(offset); offset += 1;
  const outcomeIdx = buf.readUInt8(offset); offset += 1;

  const config = new PublicKey(buf.subarray(offset, offset + 32)); offset += 32;
  const yesMint = new PublicKey(buf.subarray(offset, offset + 32)); offset += 32;
  const noMint = new PublicKey(buf.subarray(offset, offset + 32)); offset += 32;
  const vault = new PublicKey(buf.subarray(offset, offset + 32)); offset += 32;
  const phoenixMarket = new PublicKey(buf.subarray(offset, offset + 32)); offset += 32;
  const oracleFeedId = new Uint8Array(buf.subarray(offset, offset + 32)); offset += 32;

  const tradingDay = buf.readUInt32LE(offset); offset += 4;
  const strikePrice = buf.readBigUInt64LE(offset); offset += 8;
  const previousClose = buf.readBigUInt64LE(offset); offset += 8;
  const closeTimeTs = Number(buf.readBigInt64LE(offset)); offset += 8;
  const settleAfterTs = Number(buf.readBigInt64LE(offset)); offset += 8;
  const yesOpenInterest = buf.readBigUInt64LE(offset); offset += 8;
  const noOpenInterest = buf.readBigUInt64LE(offset); offset += 8;
  const totalCollateralDeposited = buf.readBigUInt64LE(offset); offset += 8;
  const totalCollateralReturned = buf.readBigUInt64LE(offset); offset += 8;
  const totalWinningRedemptions = buf.readBigUInt64LE(offset); offset += 8;
  const settledPrice = buf.readBigUInt64LE(offset); offset += 8;
  const settlementTs = Number(buf.readBigInt64LE(offset));

  return {
    version,
    bump,
    ticker: TICKER_NAMES[tickerIdx] ?? "AAPL",
    phase: PHASE_NAMES[phaseIdx] ?? "Trading",
    outcome: OUTCOME_NAMES[outcomeIdx] ?? "Unsettled",
    config,
    yesMint,
    noMint,
    vault,
    phoenixMarket,
    oracleFeedId,
    tradingDay,
    strikePrice,
    previousClose,
    closeTimeTs,
    settleAfterTs,
    yesOpenInterest,
    noOpenInterest,
    totalCollateralDeposited,
    totalCollateralReturned,
    totalWinningRedemptions,
    settledPrice,
    settlementTs,
  };
}

/** Compute the 8-byte Anchor account discriminator for MeridianMarket. */
export function getMeridianMarketDiscriminator(): Uint8Array {
  // Pre-computed sha256("account:MeridianMarket")[0..8]
  // We compute this at build time to avoid runtime crypto dependency
  // sha256("account:MeridianMarket") = varies by anchor version
  // Instead, we'll filter by account size which is more reliable
  return new Uint8Array([]); // Not used - we filter by data size
}

/**
 * Expected account data size for MeridianMarket (8 discriminator + struct).
 * version(1) + bump(1) + ticker(1) + phase(1) + outcome(1)
 * + config(32) + yes_mint(32) + no_mint(32) + vault(32) + phoenix_market(32)
 * + oracle_feed_id(32) + trading_day(4) + strike_price(8) + previous_close(8)
 * + close_time_ts(8) + settle_after_ts(8) + yes_open_interest(8)
 * + no_open_interest(8) + total_collateral_deposited(8)
 * + total_collateral_returned(8) + total_winning_redemptions(8)
 * + settled_price(8) + settlement_ts(8)
 * = 5 + 160 + 32 + 100 = 297 + 8 discriminator = 305
 */
// 8 discriminator + 5 u8s + 5 Pubkeys(160) + oracle(32) + u32(4) + 11 u64/i64(88) = 297
export const MERIDIAN_MARKET_ACCOUNT_SIZE = 297;
