import assert from "node:assert/strict";
import test from "node:test";

import {
  getSettlementConfig,
} from "../../../automation/src/config/settlement.js";
import type { MeridianEnv } from "../../../automation/src/config/env.js";

function makeFakeEnv(overrides: Partial<MeridianEnv> = {}): MeridianEnv {
  return {
    SOLANA_RPC_URL: "http://localhost:8899",
    ANCHOR_WALLET: "/tmp/wallet.json",
    MERIDIAN_PROGRAM_ID: "11111111111111111111111111111111",
    MERIDIAN_PROGRAM_KEYPAIR: "/tmp/keypair.json",
    MERIDIAN_USDC_MINT: "11111111111111111111111111111111",
    MERIDIAN_PHOENIX_PROGRAM_ID: "11111111111111111111111111111111",
    MERIDIAN_PHOENIX_SEAT_MANAGER_PROGRAM_ID: "11111111111111111111111111111111",
    MERIDIAN_PHOENIX_TAKER_FEE_BPS: 0,
    MERIDIAN_PHOENIX_MARKET_AUTHORITY_MODE: "seat-manager",
    MERIDIAN_PYTH_RECEIVER_PROGRAM_ID: "11111111111111111111111111111111",
    MERIDIAN_PYTH_PRICE_PROGRAM_ID: "11111111111111111111111111111111",
    NEXT_PUBLIC_SOLANA_CLUSTER: "devnet",
    NEXT_PUBLIC_SOLANA_RPC_URL: "http://localhost:8899",
    NEXT_PUBLIC_MERIDIAN_PROGRAM_ID: "11111111111111111111111111111111",
    NEXT_PUBLIC_MERIDIAN_USDC_MINT: "11111111111111111111111111111111",
    NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID: "11111111111111111111111111111111",
    NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID: "11111111111111111111111111111111",
    MERIDIAN_STRIKE_OFFSETS: "0.03,0.06,0.09",
    MERIDIAN_STRIKE_ROUNDING: 10,
    MERIDIAN_SETTLEMENT_RETRY_MS: 5000,
    MERIDIAN_SETTLEMENT_MAX_RETRY_MS: 900000,
    ...overrides,
  } as MeridianEnv;
}

test("getSettlementConfig returns default retry values from env", () => {
  const env = makeFakeEnv();
  const config = getSettlementConfig(env);

  assert.equal(config.retryConfig.baseDelayMs, 5000);
  assert.equal(config.retryConfig.maxDurationMs, 900000);
});

test("getSettlementConfig reflects custom env values", () => {
  const env = makeFakeEnv({
    MERIDIAN_SETTLEMENT_RETRY_MS: 2000,
    MERIDIAN_SETTLEMENT_MAX_RETRY_MS: 300000,
  });
  const config = getSettlementConfig(env);

  assert.equal(config.retryConfig.baseDelayMs, 2000);
  assert.equal(config.retryConfig.maxDurationMs, 300000);
});
