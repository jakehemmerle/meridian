use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use instructions::market::CreateMarketParams;

pub mod account_types;
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod oracle;
pub mod phoenix;
pub mod state;

pub use constants::*;
pub use errors::MeridianError;
pub use state::{
    InitializeConfigParams, MarketOutcome, MarketPhase, MeridianConfig, MeridianMarket, Ticker,
    TickerConfig,
};

declare_id!("2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y");

#[program]
pub mod meridian {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        params: InitializeConfigParams,
    ) -> Result<()> {
        instructions::config::initialize_config(ctx, params)
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        params: CreateMarketParams,
    ) -> Result<()> {
        instructions::market::create_market(ctx, params)
    }

    pub fn mint_pair(ctx: Context<MintPair>, pairs: u64) -> Result<()> {
        instructions::mint_pair::mint_pair(ctx, pairs)
    }

    pub fn merge_pair(ctx: Context<MergePair>, pairs: u64) -> Result<()> {
        instructions::merge_pair::merge_pair(ctx, pairs)
    }

    pub fn pause_protocol(ctx: Context<PauseProtocol>) -> Result<()> {
        instructions::pause::pause_protocol(ctx)
    }

    pub fn unpause_protocol(ctx: Context<PauseProtocol>) -> Result<()> {
        instructions::pause::unpause_protocol(ctx)
    }

    pub fn add_strike(
        ctx: Context<AddStrike>,
        params: CreateMarketParams,
    ) -> Result<()> {
        instructions::add_strike::add_strike(ctx, params)
    }

    pub fn settle_market(ctx: Context<SettleMarket>) -> Result<()> {
        instructions::settle::settle_market(ctx)
    }

    pub fn admin_settle_override(
        ctx: Context<AdminSettleOverride>,
        override_price: u64,
    ) -> Result<()> {
        instructions::settle::admin_settle_override(ctx, override_price)
    }
}

// --- Account Contexts ---

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub admin_authority: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = MeridianConfig::SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, MeridianConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub operations_authority: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = operations_authority,
    )]
    pub config: Box<Account<'info, MeridianConfig>>,
    #[account(
        init,
        payer = payer,
        space = MeridianMarket::SPACE,
        seeds = [
            MARKET_SEED,
            &[params.ticker as u8],
            &params.trading_day.to_le_bytes(),
            &params.strike_price.to_le_bytes(),
        ],
        bump,
    )]
    pub market: Box<Account<'info, MeridianMarket>>,
    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = market,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [YES_MINT_SEED, market.key().as_ref()],
        bump,
    )]
    pub yes_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [NO_MINT_SEED, market.key().as_ref()],
        bump,
    )]
    pub no_mint: Box<Account<'info, Mint>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintPair<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, MeridianConfig>>,
    #[account(
        mut,
        has_one = config,
        has_one = vault,
        has_one = yes_mint,
        has_one = no_mint,
    )]
    pub market: Box<Account<'info, MeridianMarket>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub yes_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub no_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        token::authority = user,
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = yes_mint,
    )]
    pub user_yes: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = no_mint,
    )]
    pub user_no: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MergePair<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, MeridianConfig>>,
    #[account(
        mut,
        has_one = config,
        has_one = vault,
        has_one = yes_mint,
        has_one = no_mint,
    )]
    pub market: Box<Account<'info, MeridianMarket>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub yes_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub no_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        token::authority = user,
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = yes_mint,
    )]
    pub user_yes: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = no_mint,
    )]
    pub user_no: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PauseProtocol<'info> {
    pub admin_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin_authority,
    )]
    pub config: Account<'info, MeridianConfig>,
}

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct AddStrike<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub admin_authority: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin_authority,
    )]
    pub config: Box<Account<'info, MeridianConfig>>,
    #[account(
        init,
        payer = payer,
        space = MeridianMarket::SPACE,
        seeds = [
            MARKET_SEED,
            &[params.ticker as u8],
            &params.trading_day.to_le_bytes(),
            &params.strike_price.to_le_bytes(),
        ],
        bump,
    )]
    pub market: Box<Account<'info, MeridianMarket>>,
    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = market,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [YES_MINT_SEED, market.key().as_ref()],
        bump,
    )]
    pub yes_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [NO_MINT_SEED, market.key().as_ref()],
        bump,
    )]
    pub no_mint: Box<Account<'info, Mint>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, MeridianConfig>>,
    #[account(
        mut,
        has_one = config,
    )]
    pub market: Box<Account<'info, MeridianMarket>>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[derive(Accounts)]
pub struct AdminSettleOverride<'info> {
    pub admin_authority: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin_authority,
    )]
    pub config: Box<Account<'info, MeridianConfig>>,
    #[account(
        mut,
        has_one = config,
    )]
    pub market: Box<Account<'info, MeridianMarket>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn program_id_matches_workspace_keypair() {
        let expected = Pubkey::from_str("2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y").unwrap();
        assert_eq!(crate::ID, expected);
    }

    #[test]
    fn config_pda_is_stable_for_the_program() {
        let (derived, _bump) = Pubkey::find_program_address(&[CONFIG_SEED], &crate::ID);
        let (derived_again, _bump_again) = Pubkey::find_program_address(&[CONFIG_SEED], &crate::ID);

        assert_eq!(derived, derived_again);
    }

    #[test]
    fn market_pda_is_deterministic_for_ticker_day_strike() {
        let ticker = Ticker::Aapl;
        let trading_day: u32 = 20260311;
        let strike_price: u64 = 200_000_000;

        let seeds: &[&[u8]] = &[
            MARKET_SEED,
            &[ticker as u8],
            &trading_day.to_le_bytes(),
            &strike_price.to_le_bytes(),
        ];

        let (pda1, bump1) = Pubkey::find_program_address(seeds, &crate::ID);
        let (pda2, bump2) = Pubkey::find_program_address(seeds, &crate::ID);

        assert_eq!(pda1, pda2);
        assert_eq!(bump1, bump2);
    }
}
