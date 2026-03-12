use anchor_lang::prelude::*;
use std::str::FromStr;

/// Phoenix V1 on-chain CLOB program ID.
pub fn phoenix_program_id() -> Pubkey {
    Pubkey::from_str("PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY").unwrap()
}

/// Phoenix Seat Manager program ID.
pub fn seat_manager_program_id() -> Pubkey {
    Pubkey::from_str("PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1").unwrap()
}

/// Derives the Phoenix seat PDA for a given market and trader.
pub fn derive_seat_address(phoenix_market: &Pubkey, trader: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"seat", phoenix_market.as_ref(), trader.as_ref()],
        &phoenix_program_id(),
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketAuthorityMode {
    SeatManager,
    MarketAuthority,
}
