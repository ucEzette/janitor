"use client";
import { useState, useMemo, useEffect } from 'react';
import { useConfig } from 'wagmi';
import { readContracts } from '@wagmi/core';
import { erc20Abi, formatUnits } from 'viem';
import { TokenData } from '../types';
import { useSweepWithFee } from '../hooks/useSweepWithFee';
import { useBurner } from '../hooks/useBurner';

const CHAINBASE_API_KEY = "3740PtFHPJzBycskDTadSmmrmJT";

interface DustSweeperProps {
  tokens: TokenData[];
  isLoading: boolean;
  onImport: (t: TokenData) => void;
}

export default function DustSweeper({ tokens = [], isLoading, onImport }: DustSweeperProps) {
  const [selectedAddresses, setSelectedAddresses] = useState<Set<string>>(new Set());
  const [hiddenTokens, setHiddenTokens] = useState<Set<string>>(new Set()); // Local "Burn" state
  const [importAddr, setImportAddr] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  
  const { sweepTokens } = useSweepWithFee();
  const { burnTokens } = useBurner();
  const config = useConfig();

  // Load hidden tokens from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('janitor_hidden_tokens');
    if (saved) setHiddenTokens(new Set(JSON.parse(saved)));
  }, []);

  // Filter out hidden tokens
  const visibleTokens = useMemo(() => {
    return tokens
      .filter(t => !hiddenTokens.has(t.address))
      .sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));
  }, [tokens, hiddenTokens]);

  const toggleToken = (address: string) => {
    const next = new Set(selectedAddresses);
    if (next.has(address)) next.delete(address);
    else next.add(address);
    setSelectedAddresses(next);
  };

  const toggleAll = () => {
    if (selectedAddresses.size === visibleTokens.length) setSelectedAddresses(new Set());
    else setSelectedAddresses(new Set(visibleTokens.map(t => t.address)));
  };

  // "Force Burn" / Hide Logic
  const hideToken = (address: string) => {
    if (confirm("Cannot burn on-chain (likely a Honeypot). Hide from app instead?")) {
      const next = new Set(hiddenTokens);
      next.add(address);
      setHiddenTokens(next);
      localStorage.setItem('janitor_hidden_tokens', JSON.stringify(Array.from(next)));
      
      // Remove from selection if it was selected
      if (selectedAddresses.has(address)) {
        const nextSel = new Set(selectedAddresses);
        nextSel.delete(address);
        setSelectedAddresses(nextSel);
      }
    }
  };

  const handleImport = async () => {
    if (!importAddr.startsWith("0x") || importAddr.length !== 42) return;
    setIsImporting(true);
    try {
      const metaRes = await fetch(`https://api.chainbase.online/v1/token/metadata?chain_id=8453&contract_address=${importAddr}`, {
        headers: { 'x-api-key': CHAINBASE_API_KEY, 'accept': 'application/json' }
      });
      const meta = await metaRes.json();
      if (!meta || !meta.data) throw new Error("Token not found");

      const account = config.state.connections.get(config.state.current || "")?.accounts[0];
      const balRes = await readContracts(config, {
        contracts: [{ address: importAddr as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [account as `0x${string}`] }]
      });

      const balance = balRes[0].result as bigint;
      if (balance > 0n) {
        const decimals = meta.data.decimals || 18;
        const newToken: TokenData = {
          address: importAddr,
          symbol: meta.data.symbol || "IMP",
          decimals: decimals,
          value: balance,
          formatted: formatUnits(balance, decimals),
          type: "Imported",
          usdValue: 0,
          price: 0,
          isImported: true,
          icon_url: meta.data.logos?.[0]?.uri || ""
        };
        onImport(newToken);
        setImportAddr("");
      } else { alert("You hold 0 of this token."); }
    } catch (e) { alert("Failed to import."); } 
    finally { setIsImporting(false); }
  };

  const executeAction = async (action: 'sweep' | 'burn') => {
    const targets = visibleTokens.filter(t => selectedAddresses.has(t.address));
    if (targets.length === 0) return;

    if (action === 'sweep') {
      setIsSweeping(true);
      try { await sweepTokens(targets); } finally { setIsSweeping(false); }
    }

    if (action === 'burn') {
      if (confirm(`Attempt to burn ${targets.length} tokens?`)) {
        setIsBurning(true);
        try {
          const result = await burnTokens(targets);
          // If some failed, alert user
          if (result?.failed && result.failed.length > 0) {
             const failNames = result.failed.map(t => t.symbol).join(", ");
             alert(`Could not burn: ${failNames}. These might be Honeypots. You can hide them manually.`);
          }
        } finally {
          setIsBurning(false);
        }
      }
    }
  };

  return (
    <div className="bg-[#1e293b] border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Dust Sweeper</h2>
        {visibleTokens.length > 0 && (
          <button onClick={toggleAll} className="text-[10px] font-bold text-yellow-500 uppercase hover:text-yellow-400">
            {selectedAddresses.size === visibleTokens.length ? "Deselect All" : "Select All"}
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <input 
          type="text" 
          placeholder="Import Token Address (0x...)" 
          value={importAddr}
          onChange={(e) => setImportAddr(e.target.value)}
          className="bg-[#0f172a] border border-slate-700 text-xs text-white p-2 rounded-lg flex-1 focus:border-yellow-500 outline-none"
        />
        <button onClick={handleImport} disabled={isImporting || !importAddr} className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 rounded-lg font-bold disabled:opacity-50">
          {isImporting ? "..." : "+"}
        </button>
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto min-h-[200px] pr-1 custom-scrollbar">
        {isLoading ? (
          <p className="text-center text-slate-500 py-10 text-xs animate-pulse">Scanning Assets...</p>
        ) : visibleTokens.length === 0 ? (
          <p className="text-center text-slate-500 py-20 text-xs">No assets found.</p>
        ) : (
          visibleTokens.map((token) => (
            <div 
              key={token.address} 
              className={`group flex items-center p-3 rounded-xl border transition-all ${
                selectedAddresses.has(token.address) ? 'bg-blue-900/20 border-blue-500' : 'bg-[#0f172a] border-slate-800 hover:border-slate-600'
              }`}
            >
              <div 
                onClick={() => toggleToken(token.address)}
                className={`cursor-pointer w-5 h-5 min-w-[20px] rounded border mr-3 flex items-center justify-center transition-colors ${
                 selectedAddresses.has(token.address) ? 'bg-blue-500 border-blue-500' : 'border-slate-600 group-hover:border-slate-400'
              }`}>
                {selectedAddresses.has(token.address) && <span className="text-white text-[10px]">✓</span>}
              </div>

              <div onClick={() => toggleToken(token.address)} className="flex-1 flex items-center gap-3 overflow-hidden cursor-pointer">
                {token.icon_url ? (
                  <img src={token.icon_url} className="w-8 h-8 rounded-full bg-slate-800" alt="" onError={(e) => e.currentTarget.style.display='none'} />
                ) : (
                   <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-white">{token.symbol.slice(0,2)}</div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white text-sm truncate">{token.symbol}</p>
                    {token.isImported && <span className="bg-purple-900/50 text-purple-400 text-[9px] px-1 rounded border border-purple-500/30">USER</span>}
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono truncate max-w-25">{token.formatted}</p>
                </div>
              </div>
              
              <div className="text-right pl-2 flex flex-col items-end gap-1">
                <p className="text-[10px] text-green-500 font-bold">${token.usdValue?.toFixed(2) || "0.00"}</p>
                {/* TRASH ICON: The "Force Burn" / Hide feature */}
                <button 
                  onClick={(e) => { e.stopPropagation(); hideToken(token.address); }}
                  className="text-slate-600 hover:text-red-500 transition-colors"
                  title="Hide token (Local Burn)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-4 gap-3">
        <button onClick={() => executeAction('sweep')} disabled={selectedAddresses.size === 0 || isSweeping || isBurning} className="col-span-3 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg transition active:scale-95 text-xs md:text-sm">
          {isSweeping ? "Sweeping..." : `Sweep ${selectedAddresses.size > 0 ? `(${selectedAddresses.size})` : ""}`}
        </button>
        <button onClick={() => executeAction('burn')} disabled={selectedAddresses.size === 0 || isSweeping || isBurning} className="col-span-1 py-3 bg-red-900/20 border border-red-900 hover:bg-red-900/40 disabled:border-slate-800 disabled:bg-transparent text-red-500 disabled:text-slate-600 font-bold rounded-xl transition active:scale-95 flex items-center justify-center">
          {isBurning ? "..." : "🔥"}
        </button>
      </div>
    </div>
  );
}