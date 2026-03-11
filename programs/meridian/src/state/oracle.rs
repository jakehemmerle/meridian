use anchor_lang::prelude::*;

use crate::{MeridianError, ORACLE_FEED_ID_BYTES};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct OraclePriceSnapshot {
    pub feed_id: [u8; ORACLE_FEED_ID_BYTES],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
}

impl OraclePriceSnapshot {
    pub fn validate_for_settlement(
        &self,
        configured_feed_id: [u8; ORACLE_FEED_ID_BYTES],
        market_feed_id: [u8; ORACLE_FEED_ID_BYTES],
        close_time_ts: i64,
        maximum_age_seconds: u32,
        confidence_limit_bps: u16,
        settlement_ts: i64,
    ) -> Result<u64> {
        require!(
            self.feed_id == configured_feed_id && self.feed_id == market_feed_id,
            MeridianError::OracleFeedMismatch
        );
        require!(
            self.publish_time <= close_time_ts,
            MeridianError::OraclePublishAfterClose
        );
        require!(
            self.publish_time
                .saturating_add(i64::from(maximum_age_seconds))
                >= settlement_ts,
            MeridianError::OraclePriceTooOld
        );
        require!(self.price > 0, MeridianError::InvalidOraclePrice);

        let price = i128::from(self.price);
        let confidence = i128::from(self.conf);
        let confidence_bps = confidence
            .checked_mul(10_000)
            .ok_or(MeridianError::MathOverflow)?
            / price;
        require!(
            confidence_bps <= i128::from(confidence_limit_bps),
            MeridianError::OracleConfidenceTooWide
        );

        scale_oracle_price_to_fixed_point(self.price, self.exponent)
    }
}

fn scale_oracle_price_to_fixed_point(price: i64, exponent: i32) -> Result<u64> {
    let scaled = i128::from(price);
    let decimal_shift = exponent + 6;
    let scaled = if decimal_shift >= 0 {
        scaled
            .checked_mul(10_i128.pow(decimal_shift as u32))
            .ok_or(MeridianError::MathOverflow)?
    } else {
        scaled / 10_i128.pow((-decimal_shift) as u32)
    };

    require!(scaled > 0, MeridianError::InvalidOraclePrice);
    u64::try_from(scaled).map_err(|_| MeridianError::MathOverflow.into())
}
