use anchor_lang::prelude::*;

use crate::{account_types::CloseMarketAccounts, MeridianError, MeridianMarket};

pub fn close_market(ctx: Context<CloseMarketAccounts>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let market: &mut MeridianMarket = &mut ctx.accounts.market;
    let config = &ctx.accounts.config;

    config.assert_protocol_active()?;

    require!(
        now >= market.close_time_ts,
        MeridianError::MarketStillTrading
    );

    market.close(now)
}
