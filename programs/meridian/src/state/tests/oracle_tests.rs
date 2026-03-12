use super::*;

use crate::{ONE_USDC, ORACLE_FEED_ID_BYTES};

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
