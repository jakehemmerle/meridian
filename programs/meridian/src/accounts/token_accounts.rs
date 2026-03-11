use anchor_lang::solana_program::pubkey::Pubkey;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TokenAccountRefs {
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub vault: Pubkey,
}
