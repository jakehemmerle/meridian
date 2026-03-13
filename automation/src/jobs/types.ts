export type JobStatus = "success" | "partial" | "error";

export interface RetryConfig {
  baseDelayMs: number;
  maxDurationMs: number;
}

export interface JobFailure {
  code: string;
  message: string;
  ticker?: string;
  strikePrice?: number;
}
