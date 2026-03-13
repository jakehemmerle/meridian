export interface RetryConfig {
  maxDurationMs: number;
  baseDelayMs: number;
  signal?: AbortSignal;
}

export type RetryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
): Promise<RetryResult<T>> {
  const { maxDurationMs, baseDelayMs, signal } = config;
  const deadline = Date.now() + maxDurationMs;
  let lastError: Error | undefined;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return { ok: false, error: new Error("Aborted") };
    }

    try {
      const value = await fn();
      return { ok: true, value };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      attempt++;

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 5000);
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("Aborted"));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, Math.min(delay, remaining));
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timer);
            reject(new Error("Aborted"));
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }
  }

  return { ok: false, error: lastError ?? new Error("Retry timed out") };
}
