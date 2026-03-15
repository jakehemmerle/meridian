import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";

export function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith("~")
    ? path.replace("~", process.env.HOME ?? "")
    : path;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(resolved, "utf-8"))),
  );
}
