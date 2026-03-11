use anchor_lang::prelude::*;

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
    #[msg("The oracle feed is not configured for this ticker.")]
    OracleFeedNotConfigured,
    #[msg("The market feed does not match the configured ticker feed.")]
    OracleFeedMismatch,
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
