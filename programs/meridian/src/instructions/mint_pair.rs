use anchor_lang::prelude::*;
use anchor_spl::token::{self, MintTo, Transfer};

use crate::{account_types::MintPairAccounts, MeridianError, ONE_USDC};

pub fn mint_pair(ctx: Context<MintPairAccounts>, pairs: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.record_mint(&ctx.accounts.config, pairs)?;

    let amount = pairs
        .checked_mul(ONE_USDC)
        .ok_or(MeridianError::MathOverflow)?;

    // Transfer USDC from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Mint Yes and No tokens to user (market PDA signs)
    let seed_parts = ctx.accounts.market.signer_seed_parts();
    let seeds = seed_parts.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.yes_mint.to_account_info(),
                to: ctx.accounts.user_yes.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Mint No tokens to user
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.no_mint.to_account_info(),
                to: ctx.accounts.user_no.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}
