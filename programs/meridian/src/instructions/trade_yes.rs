use anchor_lang::prelude::*;

use crate::phoenix::{build_phoenix_swap_instruction, validate_order_expiry, OrderParams};
use crate::{MarketPhase, MeridianError, TradeYes};

pub fn trade_yes(ctx: Context<TradeYes>, params: OrderParams) -> Result<()> {
    let config = &ctx.accounts.config;
    let market = &ctx.accounts.market;

    // 1. Assert protocol is active
    config.assert_protocol_active()?;

    // 2. Assert market is in Trading phase
    require!(
        market.phase == MarketPhase::Trading,
        MeridianError::MarketNotTrading
    );

    // 3. Assert Phoenix market matches
    require!(
        ctx.accounts.phoenix_market.key() == market.phoenix_market,
        MeridianError::PhoenixMarketMismatch
    );

    // 4. Validate order expiry
    validate_order_expiry(params.last_valid_unix_timestamp_in_seconds, market.close_time_ts)?;

    // 5. Build and invoke Phoenix Swap IOC instruction
    let swap_ix = build_phoenix_swap_instruction(
        &ctx.accounts.phoenix_program.key(),
        &ctx.accounts.log_authority.key(),
        &ctx.accounts.phoenix_market.key(),
        &ctx.accounts.user.key(),
        &ctx.accounts.seat.key(),
        &ctx.accounts.phoenix_base_vault.key(),
        &ctx.accounts.phoenix_quote_vault.key(),
        &ctx.accounts.user_yes.key(),
        &ctx.accounts.user_usdc.key(),
        &ctx.accounts.token_program.key(),
        &params,
    );

    let account_infos = &[
        ctx.accounts.phoenix_program.to_account_info(),
        ctx.accounts.log_authority.to_account_info(),
        ctx.accounts.phoenix_market.to_account_info(),
        ctx.accounts.user.to_account_info(),
        ctx.accounts.user_yes.to_account_info(),
        ctx.accounts.user_usdc.to_account_info(),
        ctx.accounts.phoenix_base_vault.to_account_info(),
        ctx.accounts.phoenix_quote_vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    ];

    anchor_lang::solana_program::program::invoke(&swap_ix, account_infos)
        .map_err(|_| error!(MeridianError::PhoenixCpiFailed))?;

    Ok(())
}
