use super::*;

use crate::ONE_USDC;

// === br-1ml: redemption state transition tests ===

fn settled_yes_market(pairs: u64) -> MeridianMarket {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, pairs).unwrap();
    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();
    market
}

fn settled_no_market(pairs: u64) -> MeridianMarket {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, pairs).unwrap();
    market.close(market.close_time_ts).unwrap();
    market
        .settle(190 * ONE_USDC, market.settle_after_ts)
        .unwrap();
    market
}

#[test]
fn redeem_after_yes_settlement_reduces_yes_oi() {
    let mut market = settled_yes_market(100);
    let before_oi = market.yes_open_interest;

    market.record_redemption(40).unwrap();

    assert_eq!(market.yes_open_interest, before_oi - 40);
    assert_eq!(market.total_winning_redemptions, 40);
    market.assert_invariants().unwrap();
}

#[test]
fn redeem_after_no_settlement_reduces_no_oi() {
    let mut market = settled_no_market(100);
    let before_oi = market.no_open_interest;

    market.record_redemption(60).unwrap();

    assert_eq!(market.no_open_interest, before_oi - 60);
    assert_eq!(market.total_winning_redemptions, 60);
    market.assert_invariants().unwrap();
}

#[test]
fn redeem_zero_pairs_rejected() {
    let mut market = settled_yes_market(100);

    let err = market.record_redemption(0).unwrap_err();
    assert!(err.to_string().contains("Pair amounts must be positive"));
}

#[test]
fn redeem_on_unsettled_market_rejected() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 50).unwrap();

    let err = market.record_redemption(10).unwrap_err();
    assert!(err.to_string().contains("has not settled"));
}

#[test]
fn redeem_on_closed_unsettled_market_rejected() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 50).unwrap();
    market.close(market.close_time_ts).unwrap();

    let err = market.record_redemption(10).unwrap_err();
    assert!(err.to_string().contains("has not settled"));
}

#[test]
fn redeem_exceeding_winning_oi_rejected() {
    let mut market = settled_yes_market(100);

    let err = market.record_redemption(101).unwrap_err();
    assert!(err.to_string().contains("unredeemed winning interest"));
}

#[test]
fn redeem_to_zero_leaves_vault_claim_at_zero() {
    let mut market = settled_yes_market(100);

    market.record_redemption(100).unwrap();

    assert_eq!(market.yes_open_interest, 0);
    assert_eq!(market.outstanding_vault_claim().unwrap(), 0);
    assert_eq!(market.required_vault_collateral().unwrap(), 0);
    market.assert_invariants().unwrap();
}

#[test]
fn multiple_partial_redemptions_maintain_invariants() {
    let mut market = settled_yes_market(100);

    market.record_redemption(30).unwrap();
    market.assert_invariants().unwrap();

    market.record_redemption(50).unwrap();
    market.assert_invariants().unwrap();

    market.record_redemption(20).unwrap();
    market.assert_invariants().unwrap();

    assert_eq!(market.yes_open_interest, 0);
    assert_eq!(market.total_winning_redemptions, 100);
}
