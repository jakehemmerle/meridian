use anchor_lang::prelude::*;
use core::mem::size_of;

declare_id!("2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y");

pub const CONFIG_SEED: &[u8] = b"config";
pub const MARKET_SEED: &[u8] = b"market";
pub const VAULT_SEED: &[u8] = b"vault";
pub const YES_MINT_SEED: &[u8] = b"yes_mint";
pub const NO_MINT_SEED: &[u8] = b"no_mint";
pub const USDC_DECIMALS: u8 = 6;
pub const ONE_USDC: u64 = 1_000_000;
pub const MAX_SUPPORTED_TICKERS: usize = 7;
pub const ORACLE_FEED_ID_BYTES: usize = 32;
pub const CONFIG_VERSION: u8 = 1;
pub const MARKET_VERSION: u8 = 1;
pub const DEFAULT_SETTLEMENT_GRACE_SECONDS: i64 = 10 * 60;
pub const DEFAULT_ORACLE_MAXIMUM_AGE_SECONDS: u32 = 10 * 60;
pub const DEFAULT_ORACLE_CONFIDENCE_LIMIT_BPS: u16 = 250;

#[program]
pub mod meridian {
    use super::*;

    pub fn bootstrap(_ctx: Context<Bootstrap>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Bootstrap {}

#[account]
#[derive(Debug)]
pub struct MeridianConfig {
    pub version: u8,
    pub bump: u8,
    pub is_paused: bool,
    pub oracle_maximum_age_seconds: u32,
    pub oracle_confidence_limit_bps: u16,
    pub admin_authority: Pubkey,
    pub operations_authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub pyth_receiver_program: Pubkey,
    pub supported_tickers: [TickerConfig; MAX_SUPPORTED_TICKERS],
}

impl MeridianConfig {
    pub const LEN: usize = 8
        + size_of::<u8>()
        + size_of::<u8>()
        + size_of::<bool>()
        + size_of::<u32>()
        + size_of::<u16>()
        + (size_of::<Pubkey>() * 4)
        + (TickerConfig::LEN * MAX_SUPPORTED_TICKERS);

    pub fn assert_protocol_active(&self) -> Result<()> {
        require!(!self.is_paused, MeridianError::ProtocolPaused);
        Ok(())
    }

    pub fn feed_id_for_ticker(&self, ticker: Ticker) -> Option<[u8; ORACLE_FEED_ID_BYTES]> {
        self.supported_tickers.iter().find_map(|entry| {
            if entry.ticker == ticker && entry.is_configured() {
                Some(entry.feed_id)
            } else {
                None
            }
        })
    }
}

#[account]
#[derive(Debug)]
pub struct MeridianMarket {
    pub version: u8,
    pub bump: u8,
    pub ticker: Ticker,
    pub phase: MarketPhase,
    pub outcome: MarketOutcome,
    pub config: Pubkey,
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub vault: Pubkey,
    pub phoenix_market: Pubkey,
    pub oracle_feed_id: [u8; ORACLE_FEED_ID_BYTES],
    pub trading_day: u32,
    pub strike_price: u64,
    pub previous_close: u64,
    pub close_time_ts: i64,
    pub settle_after_ts: i64,
    pub yes_open_interest: u64,
    pub no_open_interest: u64,
    pub total_collateral_deposited: u64,
    pub total_collateral_returned: u64,
    pub total_winning_redemptions: u64,
    pub settled_price: u64,
    pub settlement_ts: i64,
}

impl MeridianMarket {
    pub const LEN: usize = 8
        + size_of::<u8>()
        + size_of::<u8>()
        + Ticker::LEN
        + MarketPhase::LEN
        + MarketOutcome::LEN
        + (size_of::<Pubkey>() * 5)
        + ORACLE_FEED_ID_BYTES
        + size_of::<u32>()
        + (size_of::<u64>() * 8)
        + (size_of::<i64>() * 3);

    pub fn assert_can_initialize(&self, config: &MeridianConfig) -> Result<()> {
        config.assert_protocol_active()?;
        require!(
            self.oracle_feed_id != [0; ORACLE_FEED_ID_BYTES],
            MeridianError::OracleFeedNotConfigured
        );
        require!(
            self.strike_price >= ONE_USDC,
            MeridianError::InvalidStrikePrice
        );
        require!(
            self.close_time_ts < self.settle_after_ts,
            MeridianError::InvalidSettlementWindow
        );
        self.assert_invariants()
    }

    pub fn close(&mut self, now_ts: i64) -> Result<()> {
        require!(
            self.phase == MarketPhase::Trading,
            MeridianError::MarketNotTrading
        );
        require!(
            now_ts >= self.close_time_ts,
            MeridianError::MarketStillTrading
        );
        self.phase = MarketPhase::Closed;
        Ok(())
    }

    pub fn record_mint(&mut self, config: &MeridianConfig, pairs: u64) -> Result<()> {
        config.assert_protocol_active()?;
        require!(
            self.phase == MarketPhase::Trading,
            MeridianError::MarketNotTrading
        );
        require!(pairs > 0, MeridianError::InvalidPairAmount);

        self.yes_open_interest = self
            .yes_open_interest
            .checked_add(pairs)
            .ok_or(MeridianError::MathOverflow)?;
        self.no_open_interest = self
            .no_open_interest
            .checked_add(pairs)
            .ok_or(MeridianError::MathOverflow)?;
        self.total_collateral_deposited = self
            .total_collateral_deposited
            .checked_add(pairs)
            .ok_or(MeridianError::MathOverflow)?;

        self.assert_invariants()
    }

    pub fn record_merge(&mut self, config: &MeridianConfig, pairs: u64) -> Result<()> {
        config.assert_protocol_active()?;
        require!(self.is_unsettled(), MeridianError::MarketAlreadySettled);
        require!(pairs > 0, MeridianError::InvalidPairAmount);
        require!(
            self.yes_open_interest >= pairs,
            MeridianError::InsufficientYesOpenInterest
        );
        require!(
            self.no_open_interest >= pairs,
            MeridianError::InsufficientNoOpenInterest
        );

        self.yes_open_interest = self
            .yes_open_interest
            .checked_sub(pairs)
            .ok_or(MeridianError::MathOverflow)?;
        self.no_open_interest = self
            .no_open_interest
            .checked_sub(pairs)
            .ok_or(MeridianError::MathOverflow)?;
        self.total_collateral_returned = self
            .total_collateral_returned
            .checked_add(pairs)
            .ok_or(MeridianError::MathOverflow)?;

        self.assert_invariants()
    }

    pub fn settle(&mut self, settled_price: u64, now_ts: i64) -> Result<()> {
        require!(
            self.phase == MarketPhase::Closed,
            MeridianError::MarketNotClosed
        );
        require!(
            self.outcome == MarketOutcome::Unsettled,
            MeridianError::MarketAlreadySettled
        );
        require!(
            now_ts >= self.settle_after_ts,
            MeridianError::SettlementTooEarly
        );
        require!(settled_price > 0, MeridianError::InvalidSettlementPrice);

        self.outcome = if settled_price >= self.strike_price {
            MarketOutcome::Yes
        } else {
            MarketOutcome::No
        };
        self.phase = MarketPhase::Settled;
        self.settled_price = settled_price;
        self.settlement_ts = now_ts;

        self.assert_invariants()
    }

    pub fn record_redemption(&mut self, pairs: u64) -> Result<()> {
        require!(
            self.phase == MarketPhase::Settled,
            MeridianError::MarketNotSettled
        );
        require!(pairs > 0, MeridianError::InvalidPairAmount);

        let winning_open_interest = match self.outcome {
            MarketOutcome::Yes => &mut self.yes_open_interest,
            MarketOutcome::No => &mut self.no_open_interest,
            MarketOutcome::Unsettled => return err!(MeridianError::MarketNotSettled),
        };

        require!(
            *winning_open_interest >= pairs,
            MeridianError::InsufficientWinningOpenInterest
        );

        *winning_open_interest = winning_open_interest
            .checked_sub(pairs)
            .ok_or(MeridianError::MathOverflow)?;
        self.total_winning_redemptions = self
            .total_winning_redemptions
            .checked_add(pairs)
            .ok_or(MeridianError::MathOverflow)?;

        self.assert_invariants()
    }

    pub fn required_vault_collateral(&self) -> Result<u64> {
        if self.is_unsettled() {
            require!(
                self.yes_open_interest == self.no_open_interest,
                MeridianError::OpenInterestInvariantViolated
            );
            Ok(self.yes_open_interest)
        } else {
            match self.outcome {
                MarketOutcome::Yes => Ok(self.yes_open_interest),
                MarketOutcome::No => Ok(self.no_open_interest),
                MarketOutcome::Unsettled => err!(MeridianError::MarketNotSettled),
            }
        }
    }

    pub fn outstanding_vault_claim(&self) -> Result<u64> {
        let collateral_after_merges = self
            .total_collateral_deposited
            .checked_sub(self.total_collateral_returned)
            .ok_or(MeridianError::MathOverflow)?;

        collateral_after_merges
            .checked_sub(self.total_winning_redemptions)
            .ok_or(MeridianError::MathOverflow.into())
    }

    pub fn assert_invariants(&self) -> Result<()> {
        if self.is_unsettled() {
            require!(
                self.yes_open_interest == self.no_open_interest,
                MeridianError::OpenInterestInvariantViolated
            );
            require!(
                self.outcome == MarketOutcome::Unsettled,
                MeridianError::OutcomeSetBeforeSettlement
            );
            require!(
                self.settlement_ts == 0,
                MeridianError::SettlementMetadataSetTooEarly
            );
            require!(
                self.settled_price == 0,
                MeridianError::SettlementMetadataSetTooEarly
            );
        } else {
            require!(
                self.outcome != MarketOutcome::Unsettled,
                MeridianError::OutcomeMissingAfterSettlement
            );
            require!(
                self.settlement_ts > 0,
                MeridianError::SettlementMetadataMissing
            );
            require!(
                self.settled_price > 0,
                MeridianError::SettlementMetadataMissing
            );
        }

        require!(
            self.outstanding_vault_claim()? == self.required_vault_collateral()?,
            MeridianError::VaultCollateralInvariantViolated
        );

        Ok(())
    }

    pub fn is_unsettled(&self) -> bool {
        matches!(self.phase, MarketPhase::Trading | MarketPhase::Closed)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct TickerConfig {
    pub ticker: Ticker,
    pub feed_id: [u8; ORACLE_FEED_ID_BYTES],
}

impl TickerConfig {
    pub const LEN: usize = Ticker::LEN + ORACLE_FEED_ID_BYTES;

    pub const fn empty() -> Self {
        Self {
            ticker: Ticker::Aapl,
            feed_id: [0; ORACLE_FEED_ID_BYTES],
        }
    }

    pub const fn new(ticker: Ticker, feed_id: [u8; ORACLE_FEED_ID_BYTES]) -> Self {
        Self { ticker, feed_id }
    }

    pub fn is_configured(&self) -> bool {
        self.feed_id != [0; ORACLE_FEED_ID_BYTES]
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ticker {
    Aapl,
    Msft,
    Googl,
    Amzn,
    Nvda,
    Meta,
    Tsla,
}

impl Ticker {
    pub const LEN: usize = 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketPhase {
    Trading,
    Closed,
    Settled,
}

impl MarketPhase {
    pub const LEN: usize = 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketOutcome {
    Unsettled,
    Yes,
    No,
}

impl MarketOutcome {
    pub const LEN: usize = 1;
}

#[error_code]
pub enum MeridianError {
    #[msg("The protocol is paused.")]
    ProtocolPaused,
    #[msg("The market is not accepting trading actions.")]
    MarketNotTrading,
    #[msg("The market has not closed yet.")]
    MarketStillTrading,
    #[msg("The market must be closed before settlement.")]
    MarketNotClosed,
    #[msg("The market has already settled.")]
    MarketAlreadySettled,
    #[msg("The market has not settled yet.")]
    MarketNotSettled,
    #[msg("Settlement cannot happen before the configured settlement time.")]
    SettlementTooEarly,
    #[msg("Pair amounts must be positive whole-token units.")]
    InvalidPairAmount,
    #[msg("Strike prices must be at least $1.00 in 6-decimal fixed point.")]
    InvalidStrikePrice,
    #[msg("Settlement prices must be positive.")]
    InvalidSettlementPrice,
    #[msg("The settlement window is malformed.")]
    InvalidSettlementWindow,
    #[msg("The market does not have enough yes-side open interest.")]
    InsufficientYesOpenInterest,
    #[msg("The market does not have enough no-side open interest.")]
    InsufficientNoOpenInterest,
    #[msg("The market does not have enough unredeemed winning interest.")]
    InsufficientWinningOpenInterest,
    #[msg("The oracle feed is not configured for this market.")]
    OracleFeedNotConfigured,
    #[msg("Open interest must remain balanced before settlement.")]
    OpenInterestInvariantViolated,
    #[msg("The vault collateral accounting is inconsistent with open interest.")]
    VaultCollateralInvariantViolated,
    #[msg("Outcome data cannot be set before settlement.")]
    OutcomeSetBeforeSettlement,
    #[msg("Outcome data is missing after settlement.")]
    OutcomeMissingAfterSettlement,
    #[msg("Settlement metadata was set too early.")]
    SettlementMetadataSetTooEarly,
    #[msg("Settlement metadata is missing.")]
    SettlementMetadataMissing,
    #[msg("Arithmetic overflow or underflow detected.")]
    MathOverflow,
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
    fn config_feed_lookup_ignores_empty_slots() {
        let config = MeridianConfig {
            version: CONFIG_VERSION,
            bump: 1,
            is_paused: false,
            oracle_maximum_age_seconds: DEFAULT_ORACLE_MAXIMUM_AGE_SECONDS,
            oracle_confidence_limit_bps: DEFAULT_ORACLE_CONFIDENCE_LIMIT_BPS,
            admin_authority: Pubkey::new_unique(),
            operations_authority: Pubkey::new_unique(),
            usdc_mint: Pubkey::new_unique(),
            pyth_receiver_program: Pubkey::new_unique(),
            supported_tickers: [
                TickerConfig::new(Ticker::Aapl, [1; ORACLE_FEED_ID_BYTES]),
                TickerConfig::new(Ticker::Msft, [2; ORACLE_FEED_ID_BYTES]),
                TickerConfig::empty(),
                TickerConfig::empty(),
                TickerConfig::empty(),
                TickerConfig::empty(),
                TickerConfig::empty(),
            ],
        };

        assert_eq!(
            config.feed_id_for_ticker(Ticker::Aapl),
            Some([1; ORACLE_FEED_ID_BYTES])
        );
        assert_eq!(config.feed_id_for_ticker(Ticker::Nvda), None);
    }

    #[test]
    fn market_lifecycle_preserves_collateral_invariants() {
        let config = test_config(false);
        let mut market = test_market();

        market.assert_can_initialize(&config).unwrap();
        market.record_mint(&config, 5).unwrap();
        assert_eq!(market.required_vault_collateral().unwrap(), 5);

        market.record_merge(&config, 2).unwrap();
        assert_eq!(market.yes_open_interest, 3);
        assert_eq!(market.no_open_interest, 3);
        assert_eq!(market.outstanding_vault_claim().unwrap(), 3);

        market.close(market.close_time_ts).unwrap();
        market
            .settle(210 * ONE_USDC, market.settle_after_ts)
            .unwrap();
        assert_eq!(market.outcome, MarketOutcome::Yes);
        assert_eq!(market.required_vault_collateral().unwrap(), 3);

        market.record_redemption(1).unwrap();
        assert_eq!(market.yes_open_interest, 2);
        assert_eq!(market.outstanding_vault_claim().unwrap(), 2);
        market.assert_invariants().unwrap();
    }

    #[test]
    fn settlement_requires_closed_market() {
        let mut market = test_market();

        let err = market
            .settle(210 * ONE_USDC, market.settle_after_ts)
            .unwrap_err();

        assert!(err.to_string().contains("must be closed"));
    }

    #[test]
    fn invariant_checks_reject_unbalanced_open_interest_before_settlement() {
        let mut market = test_market();
        market.yes_open_interest = 4;
        market.no_open_interest = 3;
        market.total_collateral_deposited = 4;

        let err = market.assert_invariants().unwrap_err();
        assert!(err.to_string().contains("Open interest"));
    }

    fn test_config(is_paused: bool) -> MeridianConfig {
        MeridianConfig {
            version: CONFIG_VERSION,
            bump: 1,
            is_paused,
            oracle_maximum_age_seconds: DEFAULT_ORACLE_MAXIMUM_AGE_SECONDS,
            oracle_confidence_limit_bps: DEFAULT_ORACLE_CONFIDENCE_LIMIT_BPS,
            admin_authority: Pubkey::new_unique(),
            operations_authority: Pubkey::new_unique(),
            usdc_mint: Pubkey::new_unique(),
            pyth_receiver_program: Pubkey::new_unique(),
            supported_tickers: [
                TickerConfig::new(Ticker::Aapl, [11; ORACLE_FEED_ID_BYTES]),
                TickerConfig::new(Ticker::Msft, [12; ORACLE_FEED_ID_BYTES]),
                TickerConfig::new(Ticker::Googl, [13; ORACLE_FEED_ID_BYTES]),
                TickerConfig::new(Ticker::Amzn, [14; ORACLE_FEED_ID_BYTES]),
                TickerConfig::new(Ticker::Nvda, [15; ORACLE_FEED_ID_BYTES]),
                TickerConfig::new(Ticker::Meta, [16; ORACLE_FEED_ID_BYTES]),
                TickerConfig::new(Ticker::Tsla, [17; ORACLE_FEED_ID_BYTES]),
            ],
        }
    }

    fn test_market() -> MeridianMarket {
        MeridianMarket {
            version: MARKET_VERSION,
            bump: 1,
            ticker: Ticker::Aapl,
            phase: MarketPhase::Trading,
            outcome: MarketOutcome::Unsettled,
            config: Pubkey::new_unique(),
            yes_mint: Pubkey::new_unique(),
            no_mint: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            phoenix_market: Pubkey::new_unique(),
            oracle_feed_id: [22; ORACLE_FEED_ID_BYTES],
            trading_day: 20260311,
            strike_price: 200 * ONE_USDC,
            previous_close: 198 * ONE_USDC,
            close_time_ts: 1_763_504_400,
            settle_after_ts: 1_763_504_400 + DEFAULT_SETTLEMENT_GRACE_SECONDS,
            yes_open_interest: 0,
            no_open_interest: 0,
            total_collateral_deposited: 0,
            total_collateral_returned: 0,
            total_winning_redemptions: 0,
            settled_price: 0,
            settlement_ts: 0,
        }
    }
}
