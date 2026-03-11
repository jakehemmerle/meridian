use anchor_lang::prelude::*;

use crate::{MeridianError, ONE_USDC, ORACLE_FEED_ID_BYTES};

use super::{MeridianConfig, MarketOutcome, MarketPhase, OraclePriceSnapshot, Ticker};

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

    pub fn settlement_price_from_snapshot(
        &self,
        config: &MeridianConfig,
        snapshot: &OraclePriceSnapshot,
        settlement_ts: i64,
    ) -> Result<u64> {
        snapshot.validate_for_settlement(
            config.feed_id_for_ticker(self.ticker)?,
            self.oracle_feed_id,
            self.close_time_ts,
            config.oracle_maximum_age_seconds,
            config.oracle_confidence_limit_bps,
            settlement_ts,
        )
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
