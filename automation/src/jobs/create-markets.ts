export interface CreateMarketsJobResult {
  status: "pending";
  job: "create-markets";
  detail: string;
}

export async function runCreateMarketsJob(): Promise<CreateMarketsJobResult> {
  return {
    status: "pending",
    job: "create-markets",
    detail: "Market creation orchestration is not implemented yet.",
  };
}
