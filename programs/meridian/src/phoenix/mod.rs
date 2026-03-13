use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use std::str::FromStr;

use crate::MeridianError;

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

/// Which side of the Yes token market the user is trading.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradeSide {
    Buy,
    Sell,
}

/// Parameters for a trade_yes instruction.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OrderParams {
    pub side: TradeSide,
    pub num_base_lots: u64,
    pub price_in_ticks: Option<u64>,
    pub last_valid_unix_timestamp_in_seconds: Option<i64>,
}

/// Validate that the order expiry does not exceed the market close time.
pub fn validate_order_expiry(
    last_valid_ts: Option<i64>,
    close_time_ts: i64,
) -> Result<()> {
    if let Some(ts) = last_valid_ts {
        require!(
            ts <= close_time_ts,
            MeridianError::OrderExpiryExceedsMarketClose
        );
    }
    Ok(())
}

/// Derive the Phoenix log authority PDA.
pub fn derive_log_authority() -> Pubkey {
    let (key, _) = Pubkey::find_program_address(&[b"log"], &phoenix_program_id());
    key
}

/// Build the raw Phoenix Swap instruction (discriminant 0) with an IOC order packet.
///
/// Phoenix Swap instruction accounts:
///   0. phoenix_program (read)
///   1. log_authority (read)
///   2. market (write)
///   3. trader (signer)
///   4. seat (write)
///   5. base_vault (write)
///   6. quote_vault (write)
///   7. base_account (write) — trader's base token account
///   8. quote_account (write) — trader's quote token account
///   9. token_program (read)
///
/// IOC OrderPacket layout (borsh):
///   tag(u8=1) + side(u8) + price_in_ticks(Option<u64>) + num_base_lots(u64) +
///   num_quote_lots(u64) + min_base_lots_to_fill(u64) + min_quote_lots_to_fill(u64) +
///   self_trade_behavior(u8) + match_limit(Option<u64>) +
///   client_order_id(u128) + use_only_deposited_funds(bool) +
///   last_valid_slot(Option<u64>) + last_valid_unix_timestamp_in_seconds(Option<u64>)
pub fn build_phoenix_swap_instruction(
    phoenix_program: &Pubkey,
    log_authority: &Pubkey,
    phoenix_market: &Pubkey,
    trader: &Pubkey,
    seat: &Pubkey,
    base_vault: &Pubkey,
    quote_vault: &Pubkey,
    base_account: &Pubkey,
    quote_account: &Pubkey,
    token_program: &Pubkey,
    params: &OrderParams,
) -> Instruction {
    let phoenix_side: u8 = match params.side {
        TradeSide::Buy => 0,  // Bid
        TradeSide::Sell => 1, // Ask
    };

    // Build IOC OrderPacket
    let mut data = Vec::with_capacity(128);
    // Swap discriminant
    data.push(0u8);

    // OrderPacket tag: ImmediateOrCancel = 1
    data.push(1u8);

    // side
    data.push(phoenix_side);

    // price_in_ticks: Option<u64>
    match params.price_in_ticks {
        Some(price) => {
            data.push(1u8); // Some
            data.extend_from_slice(&price.to_le_bytes());
        }
        None => {
            data.push(0u8); // None
        }
    }

    // num_base_lots: u64
    data.extend_from_slice(&params.num_base_lots.to_le_bytes());

    // num_quote_lots: u64 (0 = no quote-side limit)
    data.extend_from_slice(&0u64.to_le_bytes());

    // min_base_lots_to_fill: u64 (0 = no minimum)
    data.extend_from_slice(&0u64.to_le_bytes());

    // min_quote_lots_to_fill: u64 (0 = no minimum)
    data.extend_from_slice(&0u64.to_le_bytes());

    // self_trade_behavior: u8 (0 = Abort)
    data.push(0u8);

    // match_limit: Option<u64> (None = no limit)
    data.push(0u8);

    // client_order_id: u128 (0)
    data.extend_from_slice(&0u128.to_le_bytes());

    // use_only_deposited_funds: bool (false)
    data.push(0u8);

    // last_valid_slot: Option<u64> (None)
    data.push(0u8);

    // last_valid_unix_timestamp_in_seconds: Option<u64>
    match params.last_valid_unix_timestamp_in_seconds {
        Some(ts) => {
            data.push(1u8); // Some
            data.extend_from_slice(&(ts as u64).to_le_bytes());
        }
        None => {
            data.push(0u8); // None
        }
    }

    let accounts = vec![
        AccountMeta::new_readonly(*phoenix_program, false),
        AccountMeta::new_readonly(*log_authority, false),
        AccountMeta::new(*phoenix_market, false),
        AccountMeta::new_readonly(*trader, true),
        AccountMeta::new(*seat, false),
        AccountMeta::new(*base_vault, false),
        AccountMeta::new(*quote_vault, false),
        AccountMeta::new(*base_account, false),
        AccountMeta::new(*quote_account, false),
        AccountMeta::new_readonly(*token_program, false),
    ];

    Instruction {
        program_id: *phoenix_program,
        accounts,
        data,
    }
}
