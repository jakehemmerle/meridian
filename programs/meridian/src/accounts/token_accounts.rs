use anchor_lang::solana_program::pubkey::Pubkey;

use crate::MeridianMarket;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TokenAccountRefs {
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub vault: Pubkey,
}

impl TokenAccountRefs {
    pub const fn new(yes_mint: Pubkey, no_mint: Pubkey, vault: Pubkey) -> Self {
        Self {
            yes_mint,
            no_mint,
            vault,
        }
    }

    pub fn from_market(market: &MeridianMarket) -> Self {
        Self::new(market.yes_mint, market.no_mint, market.vault)
    }
}
