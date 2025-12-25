"use client";
import { useState, useEffect, useCallback } from 'react';
import { formatUnits } from 'viem';
import { TokenData } from '../types';

const BLOCKSCOUT_KEY = "bf02a451-c424-4eb6-a0ed-20dbda975f0a";

export function useScanner(address: string | undefined) {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const scan = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);

    try {
      // 1. Fetch Balances
      const balUrl = `https://base.blockscout.com/api/v2/addresses/${address}/token-balances?apikey=${BLOCKSCOUT_KEY}`;
      const balRes = await fetch(balUrl);
      const balData = await balRes.json();

      if (Array.isArray(balData)) {
        const mappedTokens = balData.map((item: any) => {
          const val = BigInt(item.value || "0");
          const dec = parseInt(item.token?.decimals || "18");
          const price = parseFloat(item.token?.exchange_rate || "0");
          return {
            address: item.token?.address || "",
            symbol: item.token?.symbol || "UNK",
            decimals: dec,
            value: val,
            formatted: formatUnits(val, dec),
            usdValue: price * parseFloat(formatUnits(val, dec)),
            icon_url: item.token?.icon_url,
            type: "BlockscoutV2"
          };
        }).filter(t => t.value > 0n);
        setTokens(mappedTokens.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0)));
      }

      // 2. Fetch Approvals
      const appUrl = `https://base.blockscout.com/api/v2/addresses/${address}/approvals?type=ERC-20&apikey=${BLOCKSCOUT_KEY}`;
      const appRes = await fetch(appUrl);
      const appData = await appRes.json();

      if (appData.items) {
        setApprovals(appData.items.map((item: any) => ({
          tokenAddress: item.token?.address,
          spenderAddress: item.spender?.address,
          symbol: item.token?.symbol || "UNK"
        })));
      }
    } catch (e) { console.error("Scan Failed", e); }
    finally { setIsLoading(false); }
  }, [address]);

  useEffect(() => { scan(); }, [scan]);
  return { tokens, approvals, isLoading, refetch: scan };
}