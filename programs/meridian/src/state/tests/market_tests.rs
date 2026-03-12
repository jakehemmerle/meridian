use super::*;

use crate::{ONE_USDC, ORACLE_FEED_ID_BYTES};

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

#[test]
fn market_initialization_requires_matching_feed() {
    let config = test_config(false);
    let mut market = test_market();
    market.oracle_feed_id = [99; ORACLE_FEED_ID_BYTES];

    let err = market.assert_can_initialize(&config).unwrap_err();
    assert!(err.to_string().contains("configured ticker feed"));
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
fn invariant_checks_reject_unbalanced_open_interest_before_settlement() {
    let mut market = test_market();
    market.yes_open_interest = 4;
    market.no_open_interest = 3;
    market.total_collateral_deposited = 4;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("Open interest"));
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
