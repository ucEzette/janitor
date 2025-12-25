"use client";
import { useState, useEffect } from 'react';
import { useReadContracts, useWriteContract, useAccount } from 'wagmi';
import { erc20Abi } from 'viem';
import { TokenData } from '../types';

const BLOCKSCOUT_KEY = "bf02a451-c424-4eb6-a0ed-20dbda975f0a";

interface AllowanceRevokerProps {
  tokens: TokenData[]; // FIX: Now accepts tokens matching page.tsx
  isLoading: boolean;
}

export default function AllowanceRevoker({ tokens = [], isLoading: parentLoading }: AllowanceRevokerProps) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [active, setActive] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [scanLoading, setScanLoading] = useState(false);

  // 1. Fetch Approval Candidates from Blockscout
  useEffect(() => {
    const fetchApprovals = async () => {
      if (!address) return;
      setScanLoading(true);
      try {
        const url = `https://base.blockscout.com/api/v2/addresses/${address}/approvals?type=ERC-20&apikey=${BLOCKSCOUT_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.items) {
           setCandidates(data.items.map((item: any) => ({
             tokenAddress: item.token?.address,
             spenderAddress: item.spender?.address,
             blockscoutSymbol: item.token?.symbol
           })));
        }
      } catch (e) { console.error(e); }
      finally { setScanLoading(false); }
    };
    fetchApprovals();
  }, [address]);

  // 2. Verify On-Chain (Double Check)
  const { data: results, refetch } = useReadContracts({
    contracts: candidates.map(c => ({
      address: c.tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [address as `0x${string}`, c.spenderAddress as `0x${string}`]
    })),
    query: { enabled: candidates.length > 0 }
  });

  // 3. Merge Data
  useEffect(() => {
    if (!results) return;
    const found = candidates.map((c, i) => {
      const res = results[i];
      if (res?.status === "success" && (res.result as bigint) > 0n) {
        // Match with our known tokens to get nice metadata
        const knownToken = tokens.find(t => t.address.toLowerCase() === c.tokenAddress.toLowerCase());
        return { 
          ...c, 
          symbol: knownToken?.symbol || c.blockscoutSymbol || "UNK",
          amount: res.result 
        };
      }
      return null;
    }).filter(Boolean);
    setActive(found);
  }, [results, candidates, tokens]);

  const revoke = async (token: string, spender: string) => {
    try {
      await writeContractAsync({ 
        address: token as `0x${string}`, 
        abi: erc20Abi, 
        functionName: 'approve', 
        args: [spender as `0x${string}`, 0n] 
      });
      setTimeout(() => refetch?.(), 3000);
    } catch (e) { console.error(e); }
  };

  const isLoading = parentLoading || scanLoading;

  return (
    <div className="bg-[#1e293b] border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col h-full">
      <h2 className="text-xl font-bold text-white mb-4">Allowance Manager</h2>
      
      <div className="space-y-3 min-h-50 overflow-y-auto max-h-100 flex-1 pr-1 custom-scrollbar">
        {isLoading ? (
          <p className="text-center text-slate-500 py-10 text-xs animate-pulse">Scanning Approvals...</p>
        ) : active.length === 0 ? (
          <p className="text-center text-slate-500 py-20 text-xs">Wallet is Secure.</p>
        ) : (
          active.map((item, i) => (
            <div key={i} className="flex justify-between items-center bg-[#0f172a] p-3 rounded-xl border border-slate-800">
              <div>
                <p className="font-bold text-white text-sm">{item.symbol}</p>
                <p className="text-[10px] text-slate-500 font-mono">Spender: {item.spenderAddress.slice(0,6)}...</p>
              </div>
              <button 
                onClick={() => revoke(item.tokenAddress, item.spenderAddress)} 
                className="bg-red-900/20 text-red-400 border border-red-900/50 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-900/40 transition"
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}