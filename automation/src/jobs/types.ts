export type JobStatus = "success" | "partial" | "error";

export type { RetryConfig } from "./retry.js";

export const FAILURE_CODES = {
  ORACLE_FETCH_FAILED: "ORACLE_FETCH_FAILED",
  SETTLEMENT_TX_FAILED: "SETTLEMENT_TX_FAILED",
} as const;

export type FailureCode = (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES];

export interface JobFailure {
  code: FailureCode;
  message: string;
  ticker?: string;
  strikePrice?: number;
}
