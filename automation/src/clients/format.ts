export const ONE_USDC = 1_000_000;

export function formatUsdc(amount: bigint): string {
  const whole = amount / BigInt(ONE_USDC);
  const frac = amount % BigInt(ONE_USDC);
  return `${whole}.${frac.toString().padStart(6, "0")} USDC`;
}

export function explorerUrl(sig: string, cluster = "devnet"): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}
