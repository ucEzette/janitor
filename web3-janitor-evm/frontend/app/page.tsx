"use client";
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTokenScanner } from './hooks/useTokenScanner';
import { TokenData } from './types'; // Import types
import DustSweeper from './components/DustSweeper';
import AllowanceRevoker from './components/AllowanceRevoker';

export default function Home() {
  const { address, isConnected } = useAccount();
  const { tokens: scannedTokens, isLoading } = useTokenScanner(address, 8453);
  
  // Local state to hold scanned + imported tokens
  const [allTokens, setAllTokens] = useState<TokenData[]>([]);

  useEffect(() => {
    setAllTokens(scannedTokens);
  }, [scannedTokens]);

  const handleManualImport = (newToken: TokenData) => {
    // Avoid duplicates
    if (!allTokens.find(t => t.address.toLowerCase() === newToken.address.toLowerCase())) {
      setAllTokens(prev => [newToken, ...prev]);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] p-4 md:p-6 text-white">
      {/* ... Header ... */}
      <div className="max-w-7xl mx-auto space-y-8">
         <header className="flex justify-between items-center bg-[#1e293b] p-6 rounded-2xl border border-slate-700 shadow-2xl">
          <h1 className="text-3xl font-black text-yellow-500 uppercase tracking-tighter">Janitor</h1>
          <ConnectButton />
        </header>

        {isConnected ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start h-150">
             {/* Pass handleManualImport to DustSweeper */}
            <DustSweeper tokens={allTokens} isLoading={isLoading} onImport={handleManualImport} />
            <AllowanceRevoker tokens={allTokens} isLoading={isLoading} />
          </div>
        ) : (
          <div className="text-center py-40 bg-[#1e293b] rounded-3xl border border-slate-700 text-slate-500">
            Connect Wallet
          </div>
        )}
      </div>
    </div>
  );
}