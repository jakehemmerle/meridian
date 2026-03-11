use super::*;
use anchor_lang::prelude::Pubkey;

use crate::{CONFIG_VERSION, MARKET_VERSION, ONE_USDC, ORACLE_FEED_ID_BYTES};

const TEST_SETTLEMENT_GRACE_SECONDS: i64 = 10 * 60;
const TEST_ORACLE_MAXIMUM_AGE_SECONDS: u32 = 10 * 60;
const TEST_ORACLE_CONFIDENCE_LIMIT_BPS: u16 = 250;

#[test]
fn config_feed_lookup_returns_expected_feed() {
    let config = test_config(false);

    assert_eq!(
        config.feed_id_for_ticker(Ticker::Aapl).unwrap(),
        [11; ORACLE_FEED_ID_BYTES]
    );
    assert_eq!(
        config.feed_id_for_ticker(Ticker::Tsla).unwrap(),
        [17; ORACLE_FEED_ID_BYTES]
    );
}

#[test]
fn config_initialization_populates_deterministic_defaults() {
    let admin_authority = Pubkey::new_unique();
    let operations_authority = Pubkey::new_unique();
    let usdc_mint = Pubkey::new_unique();
    let pyth_receiver_program = Pubkey::new_unique();
    let mut config = uninitialized_config();

    config
        .initialize(
            7,
            &InitializeConfigParams {
                admin_authority,
                operations_authority,
                usdc_mint,
                pyth_receiver_program,
                oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
                oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
            },
            admin_authority,
        )
        .unwrap();

    assert_eq!(config.version, CONFIG_VERSION);
    assert_eq!(config.bump, 7);
    assert_eq!(config.admin_authority, admin_authority);
    assert_eq!(config.operations_authority, operations_authority);
    assert_eq!(config.usdc_mint, usdc_mint);
    assert_eq!(config.pyth_receiver_program, pyth_receiver_program);
}

#[test]
fn config_initialization_rejects_double_init() {
    let admin_authority = Pubkey::new_unique();
    let mut config = uninitialized_config();
    let params = InitializeConfigParams {
        admin_authority,
        operations_authority: Pubkey::new_unique(),
        usdc_mint: Pubkey::new_unique(),
        pyth_receiver_program: Pubkey::new_unique(),
        oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
        oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
    };

    config.initialize(3, &params, admin_authority).unwrap();
    let err = config.initialize(4, &params, admin_authority).unwrap_err();

    assert!(err.to_string().contains("already been initialized"));
}

#[test]
fn config_initialization_rejects_wrong_authority() {
    let admin_authority = Pubkey::new_unique();
    let mut config = uninitialized_config();

    let err = config
        .initialize(
            3,
            &InitializeConfigParams {
                admin_authority,
                operations_authority: Pubkey::new_unique(),
                usdc_mint: Pubkey::new_unique(),
                pyth_receiver_program: Pubkey::new_unique(),
                oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
                oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
            },
            Pubkey::new_unique(),
        )
        .unwrap_err();

    assert!(err.to_string().contains("signing authority"));
}

#[test]
fn market_lifecycle_preserves_collateral_invariants() {
    let config = test_config(false);
    let mut market = test_market();

    market.assert_can_initialize(&config).unwrap();
    market.record_mint(&config, 5).unwrap();
    assert_eq!(market.required_vault_collateral().unwrap(), 5);

    market.record_merge(&config, 2).unwrap();
    assert_eq!(market.yes_open_interest, 3);
    assert_eq!(market.no_open_interest, 3);
    assert_eq!(market.outstanding_vault_claim().unwrap(), 3);

    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();
    assert_eq!(market.outcome, MarketOutcome::Yes);
    assert_eq!(market.required_vault_collateral().unwrap(), 3);

    market.record_redemption(1).unwrap();
    assert_eq!(market.yes_open_interest, 2);
    assert_eq!(market.outstanding_vault_claim().unwrap(), 2);
    market.assert_invariants().unwrap();
}

#[test]
fn market_initialization_requires_matching_feed() {
    let config = test_config(false);
    let mut market = test_market();
    market.oracle_feed_id = [99; ORACLE_FEED_ID_BYTES];

    let err = market.assert_can_initialize(&config).unwrap_err();
    assert!(err.to_string().contains("configured ticker feed"));
}

#[test]
fn settlement_requires_closed_market() {
    let mut market = test_market();

    let err = market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap_err();

    assert!(err.to_string().contains("must be closed"));
}

#[test]
fn invariant_checks_reject_unbalanced_open_interest_before_settlement() {
    let mut market = test_market();
    market.yes_open_interest = 4;
    market.no_open_interest = 3;
    market.total_collateral_deposited = 4;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("Open interest"));
}

#[test]
fn settlement_snapshot_returns_fixed_point_price_when_valid() {
    let config = test_config(false);
    let market = closed_market();

    let price = market
        .settlement_price_from_snapshot(
            &config,
            &OraclePriceSnapshot {
                feed_id: [11; ORACLE_FEED_ID_BYTES],
                price: 20_500_000_000,
                conf: 10_000_000,
                exponent: -8,
                publish_time: market.close_time_ts,
            },
            market.settle_after_ts,
        )
        .unwrap();

    assert_eq!(price, 205 * ONE_USDC);
}

#[test]
fn settlement_snapshot_rejects_wrong_feed() {
    let config = test_config(false);
    let market = closed_market();

    let err = market
        .settlement_price_from_snapshot(
            &config,
            &OraclePriceSnapshot {
                feed_id: [99; ORACLE_FEED_ID_BYTES],
                price: 20_500_000_000,
                conf: 10_000_000,
                exponent: -8,
                publish_time: market.close_time_ts,
            },
            market.settle_after_ts,
        )
        .unwrap_err();

    assert!(err.to_string().contains("configured ticker feed"));
}

#[test]
fn settlement_snapshot_rejects_post_close_publish_time() {
    let config = test_config(false);
    let market = closed_market();

    let err = market
        .settlement_price_from_snapshot(
            &config,
            &OraclePriceSnapshot {
                feed_id: [11; ORACLE_FEED_ID_BYTES],
                price: 20_500_000_000,
                conf: 10_000_000,
                exponent: -8,
                publish_time: market.close_time_ts + 1,
            },
            market.settle_after_ts,
        )
        .unwrap_err();

    assert!(err.to_string().contains("after market close"));
}

#[test]
fn settlement_snapshot_rejects_stale_publish_time() {
    let config = test_config(false);
    let market = closed_market();

    let err = market
        .settlement_price_from_snapshot(
            &config,
            &OraclePriceSnapshot {
                feed_id: [11; ORACLE_FEED_ID_BYTES],
                price: 20_500_000_000,
                conf: 10_000_000,
                exponent: -8,
                publish_time: market.settle_after_ts
                    - i64::from(TEST_ORACLE_MAXIMUM_AGE_SECONDS)
                    - 1,
            },
            market.settle_after_ts,
        )
        .unwrap_err();

    assert!(err.to_string().contains("too old"));
}

#[test]
fn settlement_snapshot_rejects_wide_confidence_band() {
    let config = test_config(false);
    let market = closed_market();

    let err = market
        .settlement_price_from_snapshot(
            &config,
            &OraclePriceSnapshot {
                feed_id: [11; ORACLE_FEED_ID_BYTES],
                price: 20_500_000_000,
                conf: 1_000_000_000,
                exponent: -8,
                publish_time: market.close_time_ts,
            },
            market.settle_after_ts,
        )
        .unwrap_err();

    assert!(err.to_string().contains("confidence band"));
}

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

// === br-36c: create_market TDD tests ===

#[test]
fn market_creation_sets_all_initial_fields() {
    let config = test_config(false);
    let market = test_market();

    market.assert_can_initialize(&config).unwrap();

    assert_eq!(market.phase, MarketPhase::Trading);
    assert_eq!(market.outcome, MarketOutcome::Unsettled);
    assert_eq!(market.yes_open_interest, 0);
    assert_eq!(market.no_open_interest, 0);
    assert_eq!(market.total_collateral_deposited, 0);
    assert_eq!(market.total_collateral_returned, 0);
    assert_eq!(market.total_winning_redemptions, 0);
}

#[test]
fn market_creation_rejects_paused_protocol() {
    let config = test_config(true);
    let market = test_market();

    let err = market.assert_can_initialize(&config).unwrap_err();
    assert!(err.to_string().contains("paused"));
}

#[test]
fn market_creation_rejects_sub_dollar_strike() {
    let config = test_config(false);
    let mut market = test_market();
    market.strike_price = ONE_USDC - 1;

    let err = market.assert_can_initialize(&config).unwrap_err();
    assert!(err.to_string().contains("Strike prices"));
}

#[test]
fn market_creation_rejects_invalid_settlement_window() {
    let config = test_config(false);
    let mut market = test_market();
    market.settle_after_ts = market.close_time_ts;

    let err = market.assert_can_initialize(&config).unwrap_err();
    assert!(err.to_string().contains("settlement window"));
}

// === br-1xh: mint/merge/pause TDD tests ===

#[test]
fn mint_pair_increases_both_oi_and_collateral() {
    let config = test_config(false);
    let mut market = test_market();
    market.assert_can_initialize(&config).unwrap();

    market.record_mint(&config, 5).unwrap();

    assert_eq!(market.yes_open_interest, 5);
    assert_eq!(market.no_open_interest, 5);
    assert_eq!(market.total_collateral_deposited, 5);
}

#[test]
fn mint_pair_rejects_zero_amount() {
    let config = test_config(false);
    let mut market = test_market();

    let err = market.record_mint(&config, 0).unwrap_err();
    assert!(err.to_string().contains("Pair amounts"));
}

#[test]
fn mint_pair_rejects_paused_protocol() {
    let config = test_config(true);
    let mut market = test_market();

    let err = market.record_mint(&config, 5).unwrap_err();
    assert!(err.to_string().contains("paused"));
}

#[test]
fn mint_pair_rejects_non_trading_phase() {
    let config = test_config(false);
    let mut market = closed_market();

    let err = market.record_mint(&config, 5).unwrap_err();
    assert!(err.to_string().contains("not accepting trading"));
}

#[test]
fn merge_pair_decreases_oi_returns_collateral() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 5).unwrap();

    market.record_merge(&config, 2).unwrap();

    assert_eq!(market.yes_open_interest, 3);
    assert_eq!(market.no_open_interest, 3);
    assert_eq!(market.total_collateral_returned, 2);
}

#[test]
fn merge_pair_rejects_insufficient_oi() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 3).unwrap();

    let err = market.record_merge(&config, 4).unwrap_err();
    assert!(err.to_string().contains("yes-side open interest"));
}

#[test]
fn merge_pair_rejects_after_settlement() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 5).unwrap();
    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();

    let err = market.record_merge(&config, 1).unwrap_err();
    assert!(err.to_string().contains("already settled"));
}

#[test]
fn merge_pair_rejects_paused_protocol() {
    let config_active = test_config(false);
    let config_paused = test_config(true);
    let mut market = test_market();
    market.record_mint(&config_active, 5).unwrap();

    let err = market.record_merge(&config_paused, 1).unwrap_err();
    assert!(err.to_string().contains("paused"));
}

// === br-19h: add_strike TDD tests ===

#[test]
fn add_strike_creates_valid_market_same_day_different_strike() {
    let config = test_config(false);
    let mut market = test_market();
    market.strike_price = 250 * ONE_USDC;

    market.assert_can_initialize(&config).unwrap();
    assert_eq!(market.phase, MarketPhase::Trading);
    assert_eq!(market.outcome, MarketOutcome::Unsettled);
}
