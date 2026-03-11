use anchor_lang::prelude::*;

#[path = "accounts/mod.rs"]
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
}

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
}
