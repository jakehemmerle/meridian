import { type Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, type Idl } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

import idlJson from "./meridian-idl.json";
import type { Meridian } from "./meridian-types";

export const MERIDIAN_PROGRAM_ID = new PublicKey(
  "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
);

export function getMeridianProgram(
  connection: Connection,
  wallet: AnchorWallet,
): Program<Meridian> {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(idlJson as unknown as Idl, provider) as unknown as Program<Meridian>;
}
