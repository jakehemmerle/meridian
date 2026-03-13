use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Transfer};

use crate::{
    account_types::RedeemAccounts, MarketOutcome, MeridianError, MARKET_SEED, ONE_USDC,
};

pub fn redeem(ctx: Context<RedeemAccounts>, pairs: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.record_redemption(pairs)?;

    let amount = pairs
        .checked_mul(ONE_USDC)
        .ok_or(MeridianError::MathOverflow)?;

    // Burn only the winning token based on market outcome
    match market.outcome {
        MarketOutcome::Yes => {
            token::burn(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint: ctx.accounts.yes_mint.to_account_info(),
                        from: ctx.accounts.user_yes.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amount,
            )?;
        }
        MarketOutcome::No => {
            token::burn(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint: ctx.accounts.no_mint.to_account_info(),
                        from: ctx.accounts.user_no.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amount,
            )?;
        }
        MarketOutcome::Unsettled => {
            return err!(MeridianError::MarketNotSettled);
        }
    }

    // Transfer USDC from vault to user (market PDA signs)
    let market = &ctx.accounts.market;
    let ticker_byte = [market.ticker as u8];
    let trading_day_bytes = market.trading_day.to_le_bytes();
    let strike_price_bytes = market.strike_price.to_le_bytes();
    let bump = [market.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        MARKET_SEED,
        &ticker_byte,
        &trading_day_bytes,
        &strike_price_bytes,
        &bump,
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}
