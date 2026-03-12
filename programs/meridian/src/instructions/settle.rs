use anchor_lang::prelude::*;

use crate::{
    account_types::{AdminSettleOverrideAccounts, SettleMarketAccounts},
    state::OraclePriceSnapshot,
    MeridianError,
};

pub fn settle_market(ctx: Context<SettleMarketAccounts>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let market = &mut ctx.accounts.market;
    let config = &ctx.accounts.config;

    config.assert_protocol_active()?;
    market.auto_close_if_needed(now)?;

    let price_update = &ctx.accounts.price_update;
    let price_data = price_update.get_price_no_older_than(
        &clock,
        config.oracle_maximum_age_seconds.into(),
        &market.oracle_feed_id,
    )?;

    let snapshot = OraclePriceSnapshot {
        feed_id: price_update.price_message.feed_id,
        price: price_data.price,
        conf: price_data.conf,
        exponent: price_data.exponent,
        publish_time: price_data.publish_time,
    };

    let settled_price = market.settlement_price_from_snapshot(config, &snapshot, now)?;
    market.settle(settled_price, now)
}

pub fn admin_settle_override(
    ctx: Context<AdminSettleOverrideAccounts>,
    override_price: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let config = &ctx.accounts.config;
    let market = &mut ctx.accounts.market;

    config.assert_protocol_active()?;
    market.auto_close_if_needed(now)?;
    market.assert_override_eligible(now)?;
    require!(override_price > 0, MeridianError::InvalidSettlementPrice);

    market.settle(override_price, now)
}
