import * as anchor from "@coral-xyz/anchor";
import type { Meridian } from "../../../target/types/meridian.js";
import { MERIDIAN_TICKER_FEEDS } from "@meridian/domain";
import {
  deriveConfigPda,
  deriveMarketPda,
  deriveAllMarketPdas,
  derivePhoenixVault,
  SEEDS,
  feedIdToBytes,
} from "../../../automation/src/clients/pda.js";
import {
  buildApproveSeatIx,
  buildPlaceLimitOrderIx,
} from "../../../automation/src/clients/phoenix-ix.js";

export const TICKER_AAPL = 0;
export const AAPL_FEED_ID = feedIdToBytes(MERIDIAN_TICKER_FEEDS.AAPL);
export const ONE_USDC = 1_000_000;

export const PROGRAM_ID = new anchor.web3.PublicKey(
  process.env.MERIDIAN_PROGRAM_ID ?? "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

export function getTestContext() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Meridian as anchor.Program<Meridian>;
  const payer = (provider.wallet as anchor.Wallet).payer;
  return { provider, program, payer, connection: provider.connection };
}

// Re-exports
export { deriveConfigPda, deriveMarketPda, deriveAllMarketPdas, derivePhoenixVault, SEEDS, feedIdToBytes };
export { buildApproveSeatIx, buildPlaceLimitOrderIx };
export type { PlaceLimitOrderParams } from "../../../automation/src/clients/phoenix-ix.js";
export {
  createPhoenixMarket,
  MERIDIAN_PHOENIX_DEFAULTS,
  PHOENIX_MARKET_STATUS,
  buildChangeMarketStatusIx,
} from "../../../automation/src/clients/phoenix.js";
