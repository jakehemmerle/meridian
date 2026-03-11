use anchor_lang::prelude::*;

use crate::{
    account_types::CreateMarketAccounts, MeridianConfig, MeridianMarket, Ticker,
    MARKET_VERSION, ORACLE_FEED_ID_BYTES,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateMarketParams {
    pub ticker: Ticker,
    pub trading_day: u32,
    pub strike_price: u64,
    pub previous_close: u64,
    pub close_time_ts: i64,
    pub settle_after_ts: i64,
    pub oracle_feed_id: [u8; ORACLE_FEED_ID_BYTES],
    pub phoenix_market: Pubkey,
}

pub fn create_market(ctx: Context<CreateMarketAccounts>, params: CreateMarketParams) -> Result<()> {
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

pub fn initialize_market_fields(
    market: &mut MeridianMarket,
    config: &MeridianConfig,
    params: &CreateMarketParams,
    bump: u8,
    config_key: Pubkey,
    vault: Pubkey,
    yes_mint: Pubkey,
    no_mint: Pubkey,
) -> Result<()> {
    market.version = MARKET_VERSION;
    market.bump = bump;
    market.ticker = params.ticker;
    market.phase = crate::MarketPhase::Trading;
    market.outcome = crate::MarketOutcome::Unsettled;
    market.config = config_key;
    market.yes_mint = yes_mint;
    market.no_mint = no_mint;
    market.vault = vault;
    market.phoenix_market = params.phoenix_market;
    market.oracle_feed_id = params.oracle_feed_id;
    market.trading_day = params.trading_day;
    market.strike_price = params.strike_price;
    market.previous_close = params.previous_close;
    market.close_time_ts = params.close_time_ts;
    market.settle_after_ts = params.settle_after_ts;
    market.yes_open_interest = 0;
    market.no_open_interest = 0;
    market.total_collateral_deposited = 0;
    market.total_collateral_returned = 0;
    market.total_winning_redemptions = 0;
    market.settled_price = 0;
    market.settlement_ts = 0;

    market.assert_can_initialize(config)
}
