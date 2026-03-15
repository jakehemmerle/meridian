"use client";

import { useMemo } from "react";
import { type Connection, PublicKey } from "@solana/web3.js";
import { useConnection, useAnchorWallet, type AnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import idl from "./meridian-idl.json";
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
  return new Program(idl as unknown as Idl, provider) as unknown as Program<Meridian>;
}

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new Program(idl as any, provider);
  }, [connection, wallet]);
}
