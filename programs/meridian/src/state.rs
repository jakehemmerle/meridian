use anchor_lang::prelude::*;

use crate::{MeridianError, MAX_SUPPORTED_TICKERS, ONE_USDC, ORACLE_FEED_ID_BYTES};

#[cfg(test)]
use crate::{CONFIG_VERSION, MARKET_VERSION};

#[account]
#[derive(Debug, InitSpace)]
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
    pub const SPACE: usize = 8 + Self::INIT_SPACE;

    pub fn assert_protocol_active(&self) -> Result<()> {
        require!(!self.is_paused, MeridianError::ProtocolPaused);
        Ok(())
    }

    pub fn feed_id_for_ticker(&self, ticker: Ticker) -> Result<[u8; ORACLE_FEED_ID_BYTES]> {
        self.supported_tickers
            .iter()
            .find_map(|entry| (entry.ticker == ticker).then_some(entry.feed_id))
            .filter(|feed_id| *feed_id != [0; ORACLE_FEED_ID_BYTES])
            .ok_or_else(|| error!(MeridianError::OracleFeedNotConfigured))
    }
}

#[account]
#[derive(Debug, InitSpace)]
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
    pub const SPACE: usize = 8 + Self::INIT_SPACE;

    pub fn assert_can_initialize(&self, config: &MeridianConfig) -> Result<()> {
        config.assert_protocol_active()?;
        require!(
            self.strike_price >= ONE_USDC,
            MeridianError::InvalidStrikePrice
        );
        require!(
            self.close_time_ts < self.settle_after_ts,
            MeridianError::InvalidSettlementWindow
        );

        let configured_feed = config.feed_id_for_ticker(self.ticker)?;
        require!(
            self.oracle_feed_id == configured_feed,
            MeridianError::OracleFeedMismatch
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct TickerConfig {
    pub ticker: Ticker,
    pub feed_id: [u8; ORACLE_FEED_ID_BYTES],
}

impl TickerConfig {
    pub const fn new(ticker: Ticker, feed_id: [u8; ORACLE_FEED_ID_BYTES]) -> Self {
        Self { ticker, feed_id }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum Ticker {
    Aapl,
    Msft,
    Googl,
    Amzn,
    Nvda,
    Meta,
    Tsla,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum MarketPhase {
    Trading,
    Closed,
    Settled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum MarketOutcome {
    Unsettled,
    Yes,
    No,
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SETTLEMENT_GRACE_SECONDS: i64 = 10 * 60;
    const TEST_ORACLE_MAXIMUM_AGE_SECONDS: u32 = 10 * 60;
    const TEST_ORACLE_CONFIDENCE_LIMIT_BPS: u16 = 250;

    #[test]
    fn config_feed_lookup_returns_expected_feed() {
        let config = test_config(false);

        assert_eq!(
            config.feed_id_for_ticker(Ticker::Aapl).unwrap(),
            [11; ORACLE_FEED_ID_BYTES]
        );
        assert_eq!(
            config.feed_id_for_ticker(Ticker::Tsla).unwrap(),
            [17; ORACLE_FEED_ID_BYTES]
        );
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
    fn market_initialization_requires_matching_feed() {
        let config = test_config(false);
        let mut market = test_market();
        market.oracle_feed_id = [99; ORACLE_FEED_ID_BYTES];

        let err = market.assert_can_initialize(&config).unwrap_err();
        assert!(err.to_string().contains("configured ticker feed"));
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
            oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
            oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
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
            oracle_feed_id: [11; ORACLE_FEED_ID_BYTES],
            trading_day: 20260311,
            strike_price: 200 * ONE_USDC,
            previous_close: 198 * ONE_USDC,
            close_time_ts: 1_763_504_400,
            settle_after_ts: 1_763_504_400 + TEST_SETTLEMENT_GRACE_SECONDS,
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
