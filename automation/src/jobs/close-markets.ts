import { FAILURE_CODES, getErrorMessage, type JobStatus, type FailureCode } from "./types.js";

export interface CloseMarketEntry {
  ticker: string;
  strikePrice: number;
  meridianMarket: string;
  phoenixMarket: string;
}

export interface MarketCloseJobDeps {
  activeMarkets: CloseMarketEntry[];
  closePhoenixMarket: (phoenixMarket: string) => Promise<{ txSignature: string }>;
  closeMeridianMarket: (meridianMarket: string) => Promise<{ txSignature: string }>;
}

export interface MarketClosureResult {
  ticker: string;
  strikePrice: number;
  meridianMarket: string;
  phoenixMarket: string;
  status: "success" | "skipped" | "error";
  phoenixTxSignature?: string;
  meridianTxSignature?: string;
  error?: string;
  failureCode?: FailureCode;
}

export interface MarketCloseJobResult {
  status: JobStatus;
  job: "close-markets";
  detail: string;
  closures: MarketClosureResult[];
}

function isAlreadyClosedError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return msg.includes("already closed") || msg.includes("market is not active");
}

export async function runMarketCloseJob(
  deps: MarketCloseJobDeps,
): Promise<MarketCloseJobResult> {
  const { activeMarkets, closePhoenixMarket, closeMeridianMarket } = deps;

  const closures = await Promise.all(
    activeMarkets.map(async (market): Promise<MarketClosureResult> => {
      // Step 1: Close Phoenix market first
      let phoenixTxSignature: string | undefined;
      try {
        const phoenixResult = await closePhoenixMarket(market.phoenixMarket);
        phoenixTxSignature = phoenixResult.txSignature;
      } catch (err) {
        if (isAlreadyClosedError(err)) {
          // Phoenix already closed — continue to Meridian
          phoenixTxSignature = undefined;
        } else {
          return {
            ...market,
            status: "error",
            error: getErrorMessage(err),
            failureCode: FAILURE_CODES.MARKET_CLOSE_FAILED,
          };
        }
      }

      // Step 2: Close Meridian market (phase transition)
      let meridianTxSignature: string | undefined;
      try {
        const meridianResult = await closeMeridianMarket(market.meridianMarket);
        meridianTxSignature = meridianResult.txSignature;
      } catch (err) {
        if (isAlreadyClosedError(err)) {
          meridianTxSignature = undefined;
        } else {
          return {
            ...market,
            status: "error",
            phoenixTxSignature,
            error: getErrorMessage(err),
            failureCode: FAILURE_CODES.PHASE_TRANSITION_FAILED,
          };
        }
      }

      // Both already closed → skipped
      if (!phoenixTxSignature && !meridianTxSignature) {
        return { ...market, status: "skipped" };
      }

      return {
        ...market,
        status: "success",
        phoenixTxSignature,
        meridianTxSignature,
      };
    }),
  );

  const successCount = closures.filter((c) => c.status === "success").length;
  const skippedCount = closures.filter((c) => c.status === "skipped").length;
  const errorCount = closures.filter((c) => c.status === "error").length;

  let status: JobStatus;
  if (errorCount === 0) {
    status = "success";
  } else if (errorCount === closures.length) {
    status = "error";
  } else {
    status = "partial";
  }

  return {
    status,
    job: "close-markets",
    detail: `Closed ${successCount}/${closures.length} markets (skipped: ${skippedCount}, failed: ${errorCount}).`,
    closures,
  };
}
