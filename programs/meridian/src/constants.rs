pub const CONFIG_SEED: &[u8] = b"config";
pub const MARKET_SEED: &[u8] = b"market";
pub const VAULT_SEED: &[u8] = b"vault";
pub const YES_MINT_SEED: &[u8] = b"yes_mint";
pub const NO_MINT_SEED: &[u8] = b"no_mint";
pub const ONE_USDC: u64 = 1_000_000;
pub const MAX_SUPPORTED_TICKERS: usize = 7;
pub const ORACLE_FEED_ID_BYTES: usize = 32;
pub const CONFIG_VERSION: u8 = 1;
pub const MARKET_VERSION: u8 = 1;
pub const ADMIN_OVERRIDE_DELAY_SECONDS: i64 = 3600;

pub const AAPL_FEED_ID: [u8; ORACLE_FEED_ID_BYTES] = [
    73, 246, 182, 92, 177, 222, 107, 16, 234, 247, 94, 124, 3, 202, 2, 156, 48, 109, 3, 87, 233,
    27, 83, 17, 177, 117, 8, 74, 90, 213, 86, 136,
];
pub const MSFT_FEED_ID: [u8; ORACLE_FEED_ID_BYTES] = [
    208, 202, 35, 193, 204, 0, 94, 0, 76, 207, 29, 181, 191, 118, 174, 182, 164, 146, 24, 244, 61,
    172, 61, 75, 39, 94, 146, 222, 18, 222, 212, 209,
];
pub const GOOGL_FEED_ID: [u8; ORACLE_FEED_ID_BYTES] = [
    90, 72, 192, 62, 155, 156, 179, 55, 128, 16, 115, 237, 157, 22, 104, 23, 71, 54, 151, 239, 255,
    13, 19, 136, 116, 224, 246, 163, 61, 109, 90, 166,
];
pub const AMZN_FEED_ID: [u8; ORACLE_FEED_ID_BYTES] = [
    181, 208, 224, 250, 88, 161, 248, 184, 20, 152, 174, 103, 12, 233, 60, 135, 45, 20, 67, 75,
    114, 195, 100, 136, 93, 79, 161, 178, 87, 203, 176, 122,
];
pub const NVDA_FEED_ID: [u8; ORACLE_FEED_ID_BYTES] = [
    177, 7, 56, 84, 237, 36, 203, 199, 85, 220, 82, 116, 24, 245, 43, 125, 39, 31, 108, 201, 103,
    187, 248, 216, 18, 145, 18, 177, 136, 96, 165, 147,
];
pub const META_FEED_ID: [u8; ORACLE_FEED_ID_BYTES] = [
    120, 163, 227, 184, 230, 118, 168, 247, 60, 67, 159, 93, 116, 151, 55, 3, 75, 19, 155, 187,
    232, 153, 186, 87, 117, 33, 111, 186, 89, 102, 7, 254,
];
pub const TSLA_FEED_ID: [u8; ORACLE_FEED_ID_BYTES] = [
    22, 218, 213, 6, 215, 219, 141, 160, 28, 135, 88, 28, 135, 202, 137, 122, 1, 42, 21, 53, 87,
    212, 213, 120, 195, 185, 201, 225, 188, 6, 50, 241,
];
