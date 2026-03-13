use super::*;

use crate::ONE_USDC;

// === invariant adversarial tests ===

// --- Happy-path lifecycle: invariants hold through mint → merge → settle → redeem ---

#[test]
fn vault_collateral_equation_through_full_lifecycle() {
    let config = test_config(false);
    let mut market = test_market();

    // Mint 200 pairs
    market.record_mint(&config, 200).unwrap();
    assert_eq!(market.outstanding_vault_claim().unwrap(), 200);
    assert_eq!(market.required_vault_collateral().unwrap(), 200);
    market.assert_invariants().unwrap();

    // Merge 50 pairs
    market.record_merge(&config, 50).unwrap();
    assert_eq!(market.outstanding_vault_claim().unwrap(), 150);
    assert_eq!(market.required_vault_collateral().unwrap(), 150);
    market.assert_invariants().unwrap();

    // Close and settle Yes
    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();
    assert_eq!(market.outstanding_vault_claim().unwrap(), 150);
    assert_eq!(market.required_vault_collateral().unwrap(), 150);
    market.assert_invariants().unwrap();

    // Redeem 100
    market.record_redemption(100).unwrap();
    assert_eq!(market.outstanding_vault_claim().unwrap(), 50);
    assert_eq!(market.required_vault_collateral().unwrap(), 50);
    market.assert_invariants().unwrap();

    // Redeem remaining 50
    market.record_redemption(50).unwrap();
    assert_eq!(market.outstanding_vault_claim().unwrap(), 0);
    assert_eq!(market.required_vault_collateral().unwrap(), 0);
    market.assert_invariants().unwrap();
}

#[test]
fn oi_symmetry_maintained_during_trading() {
    let config = test_config(false);
    let mut market = test_market();

    market.record_mint(&config, 100).unwrap();
    assert_eq!(market.yes_open_interest, market.no_open_interest);

    market.record_mint(&config, 50).unwrap();
    assert_eq!(market.yes_open_interest, market.no_open_interest);

    market.record_merge(&config, 30).unwrap();
    assert_eq!(market.yes_open_interest, market.no_open_interest);

    market.assert_invariants().unwrap();
}

#[test]
fn settlement_metadata_consistency() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();

    // Pre-settlement: no metadata
    assert_eq!(market.settlement_ts, 0);
    assert_eq!(market.settled_price, 0);
    assert_eq!(market.outcome, MarketOutcome::Unsettled);
    market.assert_invariants().unwrap();

    // Post-settlement: all metadata set
    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();
    assert!(market.settlement_ts > 0);
    assert!(market.settled_price > 0);
    assert_ne!(market.outcome, MarketOutcome::Unsettled);
    market.assert_invariants().unwrap();
}

// --- Adversarial: manually corrupted states that SHOULD fail assert_invariants ---

#[test]
fn adversarial_oi_asymmetry_while_unsettled() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();

    // Corrupt: break OI symmetry
    market.yes_open_interest = 101;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("balanced"));
}

#[test]
fn adversarial_outcome_set_before_settlement() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();

    // Corrupt: set outcome while still trading
    market.outcome = MarketOutcome::Yes;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("cannot be set before settlement"));
}

#[test]
fn adversarial_settlement_ts_set_while_unsettled() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();

    // Corrupt: set settlement_ts while still trading
    market.settlement_ts = 1_000_000;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("too early"));
}

#[test]
fn adversarial_settled_price_set_while_unsettled() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();

    // Corrupt: set settled_price while still trading
    market.settled_price = 200 * ONE_USDC;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("too early"));
}

#[test]
fn adversarial_vault_collateral_mismatch() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();

    // Corrupt: inflate deposited without matching OI
    market.total_collateral_deposited = 200;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("inconsistent"));
}

#[test]
fn adversarial_post_settlement_missing_outcome() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();
    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();

    // Corrupt: clear outcome after settlement
    market.outcome = MarketOutcome::Unsettled;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("missing after settlement"));
}

#[test]
fn adversarial_post_settlement_missing_ts() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();
    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();

    // Corrupt: clear settlement_ts
    market.settlement_ts = 0;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("missing"));
}

#[test]
fn adversarial_post_settlement_missing_price() {
    let config = test_config(false);
    let mut market = test_market();
    market.record_mint(&config, 100).unwrap();
    market.close(market.close_time_ts).unwrap();
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();

    // Corrupt: clear settled_price
    market.settled_price = 0;

    let err = market.assert_invariants().unwrap_err();
    assert!(err.to_string().contains("missing"));
}
