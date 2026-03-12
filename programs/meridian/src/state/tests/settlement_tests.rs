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
    market
        .settle(210 * ONE_USDC, market.settle_after_ts)
        .unwrap();

    let err = market
        .settle(190 * ONE_USDC, market.settle_after_ts)
        .unwrap_err();
    // Phase is Settled after first settle, so the Closed check rejects it
    assert!(err.to_string().contains("must be closed"));
}

#[test]
fn admin_override_too_early_rejected() {
    let market = overrideable_market();

    let too_early = market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS - 1;
    let err = market.assert_override_eligible(too_early).unwrap_err();
    assert!(err.to_string().contains("1 hour after market close"));
}

#[test]
fn admin_override_rejects_trading_market() {
    let market = test_market();

    let override_time = market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS;
    let err = market.assert_override_eligible(override_time).unwrap_err();
    assert!(err.to_string().contains("must be closed"));
}

#[test]
fn admin_override_exactly_at_delay_succeeds() {
    let market = overrideable_market();

    let at_delay = market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS;
    market.assert_override_eligible(at_delay).unwrap();
}

#[test]
fn admin_override_after_delay_settles_correctly() {
    let mut market = overrideable_market();

    let override_time = market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS;
    market.assert_override_eligible(override_time).unwrap();

    let override_price = 205 * ONE_USDC;
    market.settle(override_price, override_time).unwrap();

    assert_eq!(market.outcome, MarketOutcome::Yes);
    assert_eq!(market.settled_price, override_price);
    assert_eq!(market.settlement_ts, override_time);
}

#[test]
fn admin_override_bypasses_oracle_with_arbitrary_price() {
    let mut market = overrideable_market();

    let override_time = market.close_time_ts + crate::ADMIN_OVERRIDE_DELAY_SECONDS;
    market.assert_override_eligible(override_time).unwrap();

    // Settle below strike — no oracle snapshot needed, just a raw price
    let override_price = 150 * ONE_USDC;
    market.settle(override_price, override_time).unwrap();

    assert_eq!(market.outcome, MarketOutcome::No);
    assert_eq!(market.settled_price, override_price);
}

fn overrideable_market() -> MeridianMarket {
    let mut market = test_market();
    market.close(market.close_time_ts).unwrap();
    market
}
