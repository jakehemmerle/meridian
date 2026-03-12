use super::*;
use anchor_lang::prelude::Pubkey;

use crate::{CONFIG_VERSION, ORACLE_FEED_ID_BYTES};

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
fn config_initialization_populates_deterministic_defaults() {
    let admin_authority = Pubkey::new_unique();
    let operations_authority = Pubkey::new_unique();
    let usdc_mint = Pubkey::new_unique();
    let pyth_receiver_program = Pubkey::new_unique();
    let mut config = uninitialized_config();

    config
        .initialize(
            7,
            &InitializeConfigParams {
                admin_authority,
                operations_authority,
                usdc_mint,
                pyth_receiver_program,
                oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
                oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
            },
            admin_authority,
        )
        .unwrap();

    assert_eq!(config.version, CONFIG_VERSION);
    assert_eq!(config.bump, 7);
    assert_eq!(config.admin_authority, admin_authority);
    assert_eq!(config.operations_authority, operations_authority);
    assert_eq!(config.usdc_mint, usdc_mint);
    assert_eq!(config.pyth_receiver_program, pyth_receiver_program);
}

#[test]
fn config_initialization_rejects_double_init() {
    let admin_authority = Pubkey::new_unique();
    let mut config = uninitialized_config();
    let params = InitializeConfigParams {
        admin_authority,
        operations_authority: Pubkey::new_unique(),
        usdc_mint: Pubkey::new_unique(),
        pyth_receiver_program: Pubkey::new_unique(),
        oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
        oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
    };

    config.initialize(3, &params, admin_authority).unwrap();
    let err = config.initialize(4, &params, admin_authority).unwrap_err();

    assert!(err.to_string().contains("already been initialized"));
}

#[test]
fn config_initialization_rejects_wrong_authority() {
    let admin_authority = Pubkey::new_unique();
    let mut config = uninitialized_config();

    let err = config
        .initialize(
            3,
            &InitializeConfigParams {
                admin_authority,
                operations_authority: Pubkey::new_unique(),
                usdc_mint: Pubkey::new_unique(),
                pyth_receiver_program: Pubkey::new_unique(),
                oracle_maximum_age_seconds: TEST_ORACLE_MAXIMUM_AGE_SECONDS,
                oracle_confidence_limit_bps: TEST_ORACLE_CONFIDENCE_LIMIT_BPS,
            },
            Pubkey::new_unique(),
        )
        .unwrap_err();

    assert!(err.to_string().contains("signing authority"));
}
