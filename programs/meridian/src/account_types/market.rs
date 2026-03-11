use anchor_lang::prelude::*;

use crate::MeridianMarket;

use super::TokenAccountRefs;

pub type MeridianMarketAccount<'info> = Account<'info, MeridianMarket>;

pub fn market_token_accounts(market: &MeridianMarket) -> TokenAccountRefs {
    TokenAccountRefs::from_market(market)
}
