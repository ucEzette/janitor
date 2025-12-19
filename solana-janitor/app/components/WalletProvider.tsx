"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

// Import standard wallet styles
import "@solana/wallet-adapter-react-ui/styles.css";

export const AppWalletProvider = ({ children }: { children: React.ReactNode }) => {
  const network = WalletAdapterNetwork.Mainnet;

  // FIX: Use the official Solana public endpoint.
  // Note: This is free but can be slow or rate-limited (429 errors).
  // If this fails, the only robust fix is getting a free API key from Helius.xyz or QuickNode.
  const endpoint = useMemo(() => "https://mainnet.helius-rpc.com/?api-key=4d79e503-d315-4dcf-89a5-e07d67543e3b", []);

  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};