"use client";
import { useState, useEffect, useCallback } from 'react';

const BLOCKSCOUT_KEY = "bf02a451-c424-4eb6-a0ed-20dbda975f0a";

export function useBaseScanApprovals(userAddress: string | undefined) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApprovals = useCallback(async () => {
    if (!userAddress) return;
    setLoading(true);

    try {
      const url = `https://base.blockscout.com/api/v2/addresses/${userAddress}/approvals?type=ERC-20&apikey=${BLOCKSCOUT_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.items && Array.isArray(data.items)) {
        setCandidates(data.items.map((item: any) => ({
          tokenAddress: item.token?.address || "",
          spenderAddress: item.spender?.address || "",
          amount: item.amount || "0"
        })));
      }
    } catch (e) { 
      console.error("Approvals Fetch Error:", e); 
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);
  return { candidates, loading, refetch: fetchApprovals };
}