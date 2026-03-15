"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import { readPublicMeridianEnv } from "../lib/env/public";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const endpoint = useMemo(() => {
    // Allow E2E tests to override the RPC URL via injected window variable
    if (typeof window !== "undefined") {
      const e2eUrl = (window as unknown as Record<string, string>).__E2E_RPC_URL;
      if (e2eUrl) return e2eUrl;
    }
    const env = readPublicMeridianEnv();
    return env.rpcUrl ?? clusterApiUrl("devnet");
  }, []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
