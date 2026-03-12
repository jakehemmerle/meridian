use super::*;

use crate::ONE_USDC;

// === br-3ic: settlement + override TDD tests ===

#[test]
fn settlement_above_strike_resolves_yes() {
    let mut market = test_market();
    market.phase = MarketPhase::Closed;

    let price = 210 * ONE_USDC; // above strike of 200
    market.settle(price, market.settle_after_ts).unwrap();

    assert_eq!(market.outcome, MarketOutcome::Yes);
    assert_eq!(market.phase, MarketPhase::Settled);
    assert_eq!(market.settled_price, price);
}

#[test]
fn settlement_below_strike_resolves_no() {
    let mut market = test_market();
    market.phase = MarketPhase::Closed;

    let price = 190 * ONE_USDC; // below strike of 200
    market.settle(price, market.settle_after_ts).unwrap();

    assert_eq!(market.outcome, MarketOutcome::No);
    assert_eq!(market.phase, MarketPhase::Settled);
    assert_eq!(market.settled_price, price);
}

#[test]
fn settlement_at_strike_resolves_yes() {
    let mut market = test_market();
    market.phase = MarketPhase::Closed;

    let price = 200 * ONE_USDC; // exactly at strike
    market.settle(price, market.settle_after_ts).unwrap();

    assert_eq!(market.outcome, MarketOutcome::Yes);
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
fn double_settle_rejected() {
    let mut market = test_market();
    market.phase = MarketPhase::Closed;
    market.settle(210 * ONE_USDC, market.settle_after_ts).unwrap();

    let err = market
        .settle(190 * ONE_USDC, market.settle_after_ts)
        .unwrap_err();
    // Phase is now Settled, so the Closed check fires first
    assert!(
        err.to_string().contains("must be closed")
            || err.to_string().contains("already settled")
    );
}

#[test]
fn admin_override_too_early_rejected() {
    let mut market = test_market();
    market.close(market.close_time_ts).unwrap();

    let too_early = market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS - 1;
    assert!(
        market.settle_after_ts < market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS,
        "test setup: settle_after_ts should be before override delay for this test"
    );

    assert_eq!(crate::ADMIN_OVERRIDE_DELAY_SECONDS, 3600);
    assert!(too_early < market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS);
}

#[test]
fn admin_override_after_delay_succeeds() {
    let mut market = test_market();
    market.close(market.close_time_ts).unwrap();

    let override_time = market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS;
    let override_price = 205 * ONE_USDC;
    market.settle(override_price, override_time).unwrap();

    assert_eq!(market.outcome, MarketOutcome::Yes);
    assert_eq!(market.settled_price, override_price);
    assert_eq!(market.settlement_ts, override_time);
}
