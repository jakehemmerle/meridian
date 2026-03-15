use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Transfer};

use crate::{account_types::MergePairAccounts, MeridianError, ONE_USDC};

pub fn merge_pair(ctx: Context<MergePairAccounts>, pairs: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.record_merge(&ctx.accounts.config, pairs)?;

    let amount = pairs
        .checked_mul(ONE_USDC)
        .ok_or(MeridianError::MathOverflow)?;

    // Burn Yes tokens from user
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

    // Burn No tokens from user
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

    // Transfer USDC from vault to user (market PDA signs)
    let seed_parts = ctx.accounts.market.signer_seed_parts();
    let seeds = seed_parts.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

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
