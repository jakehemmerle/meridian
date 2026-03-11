use anchor_lang::prelude::*;

use crate::{
    AAPL_FEED_ID, AMZN_FEED_ID, CONFIG_VERSION, GOOGL_FEED_ID, MAX_SUPPORTED_TICKERS,
    META_FEED_ID, MSFT_FEED_ID, MeridianError, NVDA_FEED_ID, ORACLE_FEED_ID_BYTES, TSLA_FEED_ID,
};

use super::Ticker;

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

    pub fn initialize(
        &mut self,
        bump: u8,
        params: &InitializeConfigParams,
        signer: Pubkey,
    ) -> Result<()> {
        require!(self.version == 0, MeridianError::ConfigAlreadyInitialized);
        require_keys_eq!(
            signer,
            params.admin_authority,
            MeridianError::InitializeAuthorityMismatch
        );
        require!(
            params.admin_authority != Pubkey::default(),
            MeridianError::InvalidAdminAuthority
        );
        require!(
            params.operations_authority != Pubkey::default(),
            MeridianError::InvalidOperationsAuthority
        );
        require!(
            params.usdc_mint != Pubkey::default(),
            MeridianError::InvalidUsdcMint
        );
        require!(
            params.pyth_receiver_program != Pubkey::default(),
            MeridianError::InvalidPythReceiverProgram
        );
        require!(
            params.oracle_maximum_age_seconds > 0,
            MeridianError::InvalidOracleMaximumAge
        );
        require!(
            (1..=10_000).contains(&params.oracle_confidence_limit_bps),
            MeridianError::InvalidOracleConfidenceLimit
        );

        self.version = CONFIG_VERSION;
        self.bump = bump;
        self.is_paused = false;
        self.oracle_maximum_age_seconds = params.oracle_maximum_age_seconds;
        self.oracle_confidence_limit_bps = params.oracle_confidence_limit_bps;
        self.admin_authority = params.admin_authority;
        self.operations_authority = params.operations_authority;
        self.usdc_mint = params.usdc_mint;
        self.pyth_receiver_program = params.pyth_receiver_program;
        self.supported_tickers = default_supported_tickers();

        Ok(())
    }

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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct InitializeConfigParams {
    pub admin_authority: Pubkey,
    pub operations_authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub pyth_receiver_program: Pubkey,
    pub oracle_maximum_age_seconds: u32,
    pub oracle_confidence_limit_bps: u16,
}

fn default_supported_tickers() -> [TickerConfig; MAX_SUPPORTED_TICKERS] {
    [
        TickerConfig::new(Ticker::Aapl, AAPL_FEED_ID),
        TickerConfig::new(Ticker::Msft, MSFT_FEED_ID),
        TickerConfig::new(Ticker::Googl, GOOGL_FEED_ID),
        TickerConfig::new(Ticker::Amzn, AMZN_FEED_ID),
        TickerConfig::new(Ticker::Nvda, NVDA_FEED_ID),
        TickerConfig::new(Ticker::Meta, META_FEED_ID),
        TickerConfig::new(Ticker::Tsla, TSLA_FEED_ID),
    ]
}
