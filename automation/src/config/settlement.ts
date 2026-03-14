import type { RetryConfig } from "../jobs/retry.js";
import type { MeridianEnv } from "./env.js";

export interface SettlementConfig {
  retryConfig: RetryConfig;
}

/**
 * Derive settlement retry config from validated environment.
 *
 * Env vars:
 *   MERIDIAN_SETTLEMENT_RETRY_MS     → baseDelayMs  (default 5000)
 *   MERIDIAN_SETTLEMENT_MAX_RETRY_MS → maxDurationMs (default 900000)
 */
export function getSettlementConfig(env: MeridianEnv): SettlementConfig {
  return {
    retryConfig: {
      baseDelayMs: env.MERIDIAN_SETTLEMENT_RETRY_MS,
      maxDurationMs: env.MERIDIAN_SETTLEMENT_MAX_RETRY_MS,
    },
  };
}
