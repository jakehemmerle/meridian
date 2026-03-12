import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  createPhoenixMarket,
  requestSeat,
  validatePhoenixMarket,
  MERIDIAN_PHOENIX_DEFAULTS,
  type PhoenixMarketValidation,
} from "../clients/phoenix.js";

export interface MarketCreationResult {
  ticker: string;
  tradingDay: number;
  strikePrice: number;
  meridianMarket: string;
  phoenixMarket: string;
  yesMint: string;
  seatAddress: string;
  validation: PhoenixMarketValidation;
}

export interface CreateMarketsJobResult {
  status: "success" | "error";
  job: "create-markets";
  detail: string;
  markets: MarketCreationResult[];
}

export interface CreateMarketsJobInput {
  connection: Connection;
  payer: Keypair;
  markets: Array<{
    ticker: string;
    tradingDay: number;
    strikePrice: number;
    meridianMarketPda: PublicKey;
    yesMintPda: PublicKey;
    usdcMint: PublicKey;
  }>;
}

/**
 * Orchestration: for each Meridian market, create a Phoenix market
 * with its Yes mint as base_mint and USDC as quote_mint,
 * then request a seat and validate the link.
 *
 * Assumes Meridian markets have already been created on-chain
 * (Yes mint PDAs exist).
 */
export async function runCreateMarketsJob(
  input?: CreateMarketsJobInput,
): Promise<CreateMarketsJobResult> {
  if (!input) {
    return {
      status: "error",
      job: "create-markets",
      detail: "No input provided. Pass connection, payer, and markets array.",
      markets: [],
    };
  }

  const { connection, payer, markets } = input;
  const results: MarketCreationResult[] = [];

  for (const market of markets) {
    // Step 1: Create Phoenix market with Yes mint as base, USDC as quote
    const { phoenixMarket } = await createPhoenixMarket(connection, payer, {
      ...MERIDIAN_PHOENIX_DEFAULTS,
      baseMint: market.yesMintPda,
      quoteMint: market.usdcMint,
    });

    // Step 2: Request seat for the automation wallet
    const seatAddress = await requestSeat(
      connection,
      payer,
      phoenixMarket,
      payer.publicKey,
    );

    // Step 3: Validate the Phoenix market
    const validation = await validatePhoenixMarket(
      connection,
      phoenixMarket,
      market.yesMintPda,
      market.usdcMint,
    );

    results.push({
      ticker: market.ticker,
      tradingDay: market.tradingDay,
      strikePrice: market.strikePrice,
      meridianMarket: market.meridianMarketPda.toBase58(),
      phoenixMarket: phoenixMarket.toBase58(),
      yesMint: market.yesMintPda.toBase58(),
      seatAddress: seatAddress.toBase58(),
      validation,
    });
  }

  const allValid = results.every((r) => r.validation.valid);

  return {
    status: allValid ? "success" : "error",
    job: "create-markets",
    detail: allValid
      ? `Created ${results.length} Phoenix markets successfully.`
      : `Created ${results.length} markets, some with validation errors.`,
    markets: results,
  };
}
