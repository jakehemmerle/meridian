/**
 * Shared script context — loads Anchor program from minimal env vars.
 * USDC mint is read from the on-chain config PDA (source of truth).
 *
 * Required env: SOLANA_RPC_URL, ANCHOR_WALLET, MERIDIAN_PROGRAM_ID
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { loadKeypair } from "../automation/src/clients/keypair.js";
import { deriveConfigPda } from "../automation/src/clients/pda.js";

export async function loadScriptContext() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const walletPath = process.env.ANCHOR_WALLET;
  const programIdStr = process.env.MERIDIAN_PROGRAM_ID;

  if (!rpcUrl || !walletPath || !programIdStr) {
    console.error("Missing required env: SOLANA_RPC_URL, ANCHOR_WALLET, MERIDIAN_PROGRAM_ID");
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(walletPath);
  const programId = new PublicKey(programIdStr);

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);

  let idl = await anchor.Program.fetchIdl(programId, provider);
  if (!idl) {
    try {
      idl = JSON.parse(readFileSync("target/idl/meridian.json", "utf8"));
    } catch {
      console.error("IDL not found on-chain or locally — run `anchor build` first");
      process.exit(1);
    }
  }
  const program = new anchor.Program(idl, provider);

  // Read USDC mint from on-chain config (source of truth)
  const [configPda] = deriveConfigPda(programId);
  const config = await (program.account as any).meridianConfig.fetch(configPda);
  const usdcMint: PublicKey = config.usdcMint;

  return { connection, payer, programId, provider, program, configPda, usdcMint, config };
}
