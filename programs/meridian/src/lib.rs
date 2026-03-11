use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;

pub use constants::*;
pub use errors::MeridianError;
pub use state::{MarketOutcome, MarketPhase, MeridianConfig, MeridianMarket, Ticker, TickerConfig};

declare_id!("2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y");

#[program]
pub mod meridian {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn program_id_matches_workspace_keypair() {
        let expected = Pubkey::from_str("2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y").unwrap();
        assert_eq!(crate::ID, expected);
    }
}
