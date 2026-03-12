mod config_tests;
mod market_tests;
mod oracle_tests;
mod settlement_tests;
mod trading_tests;

use super::*;
use anchor_lang::prelude::Pubkey;

use crate::{CONFIG_VERSION, MARKET_VERSION, ONE_USDC, ORACLE_FEED_ID_BYTES};

const TEST_SETTLEMENT_GRACE_SECONDS: i64 = 10 * 60;
const TEST_ORACLE_MAXIMUM_AGE_SECONDS: u32 = 10 * 60;
const TEST_ORACLE_CONFIDENCE_LIMIT_BPS: u16 = 250;

fn test_config(is_paused: bool) -> MeridianConfig {
    MeridianConfig {
        version: CONFIG_VERSION,
        bump: 1,
        is_paused,
        oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
        oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
        admin_authority: Pubkey::new_unique(),
        operations_authority: Pubkey::new_unique(),
        usdc_mint: Pubkey::new_unique(),
        pyth_receiver_program: Pubkey::new_unique(),
        supported_tickers: [
            TickerConfig::new(Ticker::Aapl, [11; ORACLE_FEED_ID_BYTES]),
            TickerConfig::new(Ticker::Msft, [12; ORACLE_FEED_ID_BYTES]),
            TickerConfig::new(Ticker::Googl, [13; ORACLE_FEED_ID_BYTES]),
            TickerConfig::new(Ticker::Amzn, [14; ORACLE_FEED_ID_BYTES]),
            TickerConfig::new(Ticker::Nvda, [15; ORACLE_FEED_ID_BYTES]),
            TickerConfig::new(Ticker::Meta, [16; ORACLE_FEED_ID_BYTES]),
            TickerConfig::new(Ticker::Tsla, [17; ORACLE_FEED_ID_BYTES]),
        ],
    }
}

fn uninitialized_config() -> MeridianConfig {
    MeridianConfig {
        version: 0,
        bump: 0,
        is_paused: false,
        oracle_maximum_age_seconds: 0,
        oracle_confidence_limit_bps: 0,
        admin_authority: Pubkey::default(),
        operations_authority: Pubkey::default(),
        usdc_mint: Pubkey::default(),
        pyth_receiver_program: Pubkey::default(),
        supported_tickers: [TickerConfig::new(Ticker::Aapl, [0; ORACLE_FEED_ID_BYTES]);
            crate::MAX_SUPPORTED_TICKERS],
    }
}

fn test_market() -> MeridianMarket {
    MeridianMarket {
        version: MARKET_VERSION,
        bump: 1,
        ticker: Ticker::Aapl,
        phase: MarketPhase::Trading,
        outcome: MarketOutcome::Unsettled,
        config: Pubkey::new_unique(),
        yes_mint: Pubkey::new_unique(),
        no_mint: Pubkey::new_unique(),
        vault: Pubkey::new_unique(),
        phoenix_market: Pubkey::new_unique(),
        oracle_feed_id: [11; ORACLE_FEED_ID_BYTES],
        trading_day: 20260311,
        strike_price: 200 * ONE_USDC,
        previous_close: 198 * ONE_USDC,
        close_time_ts: 1_763_504_400,
        settle_after_ts: 1_763_504_400 + TEST_SETTLEMENT_GRACE_SECONDS,
        yes_open_interest: 0,
        no_open_interest: 0,
        total_collateral_deposited: 0,
        total_collateral_returned: 0,
        total_winning_redemptions: 0,
        settled_price: 0,
        settlement_ts: 0,
    }
}

fn closed_market() -> MeridianMarket {
    let mut market = test_market();
    market.phase = MarketPhase::Closed;
    market
}
