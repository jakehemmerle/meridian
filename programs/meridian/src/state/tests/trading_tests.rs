use super::*;

use crate::ONE_USDC;

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
