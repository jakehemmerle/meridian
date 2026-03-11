export interface SettleMarketsJobResult {
  status: "pending";
  job: "settle-markets";
  detail: string;
}

export async function runSettleMarketsJob(): Promise<SettleMarketsJobResult> {
  return {
    status: "pending",
    job: "settle-markets",
    detail: "Settlement orchestration is not implemented yet.",
  };
}
