use anchor_lang::prelude::*;

use crate::ORACLE_FEED_ID_BYTES;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct OraclePriceSnapshot {
    pub feed_id: [u8; ORACLE_FEED_ID_BYTES],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
}
