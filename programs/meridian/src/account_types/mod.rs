pub mod config;
pub mod market;
pub mod token_accounts;

pub use config::InitializeConfigAccounts;
pub use market::MeridianMarketAccount;
pub use token_accounts::TokenAccountRefs;

pub type CreateMarketAccounts<'info> = crate::CreateMarket<'info>;
pub type MintPairAccounts<'info> = crate::MintPair<'info>;
pub type MergePairAccounts<'info> = crate::MergePair<'info>;
pub type PauseProtocolAccounts<'info> = crate::PauseProtocol<'info>;
pub type AddStrikeAccounts<'info> = crate::AddStrike<'info>;
pub type SettleMarketAccounts<'info> = crate::SettleMarket<'info>;
pub type AdminSettleOverrideAccounts<'info> = crate::AdminSettleOverride<'info>;
