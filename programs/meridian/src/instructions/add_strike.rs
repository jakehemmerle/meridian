use anchor_lang::prelude::*;

use crate::{
    account_types::AddStrikeAccounts, MeridianError,
    instructions::market::{initialize_market_fields, CreateMarketParams},
};

pub fn add_strike(ctx: Context<AddStrikeAccounts>, params: CreateMarketParams) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < params.close_time_ts,
        MeridianError::MarketClosedForTrading
    );

    let config_key = ctx.accounts.config.key();
    initialize_market_fields(
        &mut ctx.accounts.market,
        &ctx.accounts.config,
        &params,
        ctx.bumps.market,
        config_key,
        ctx.accounts.vault.key(),
        ctx.accounts.yes_mint.key(),
        ctx.accounts.no_mint.key(),
    )
}
