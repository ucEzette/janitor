import { useState, useEffect, useCallback, useRef } from 'react';
import { formatUnits, erc20Abi } from 'viem';
import { readContracts } from '@wagmi/core';
import { useConfig } from 'wagmi';
import { TokenData } from '../types';

const CHAINBASE_API_KEY = "3740PtFHPJzBycskDTadSmmrmJT";
const BASE_CHAIN_ID = "8453";
const NATIVE_ADDR = "0x0000000000000000000000000000000000000000";

// Hardcoded list of top tokens to ensure they never disappear
const PRIORITY_TOKENS = [
  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6, logo: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png" },
  { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", symbol: "USDbC", decimals: 6, logo: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png" },
  { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", decimals: 18, logo: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png" },
  { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, logo: "https://assets.coingecko.com/coins/images/2518/small/weth.png" }
];

export function useTokenScanner(address: string | undefined, chainId: number) {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isScanning = useRef(false);
  const config = useConfig(); // Wagmi config for RPC calls

  const scan = useCallback(async () => {
    if (!address || chainId !== 8453 || isScanning.current) return;
    
    isScanning.current = true;
    setIsLoading(true);
    setTokens([]);

    try {
      const options = {
        method: 'GET',
        headers: { 'x-api-key': CHAINBASE_API_KEY, 'accept': 'application/json' }
      };

      // --- PHASE 1: Fetch Native Balance & Chainbase Tokens ---
      const [nativeRes, tokenRes] = await Promise.all([
        fetch(`https://api.chainbase.online/v1/account/balance?chain_id=${BASE_CHAIN_ID}&address=${address}`, options),
        fetch(`https://api.chainbase.online/v1/account/tokens?chain_id=${BASE_CHAIN_ID}&address=${address}&limit=100&page=1`, options) // Limit increased to 100
      ]);

      // Process Native ETH
      let nativeToken: TokenData | null = null;
      if (nativeRes.ok) {
        const nData = await nativeRes.json();
        const nVal = BigInt(nData.data || 0);
        if (nVal > 0n) {
          nativeToken = {
            address: NATIVE_ADDR,
            symbol: "ETH",
            decimals: 18,
            value: nVal,
            formatted: parseFloat(formatUnits(nVal, 18)).toFixed(4),
            type: "Chainbase",
            price: 0, 
            usdValue: 0,
            icon_url: "https://cryptologos.cc/logos/ethereum-eth-logo.png"
          };
        }
      }

      // Process API Tokens (with Deep Pagination)
      let apiTokens: TokenData[] = [];
      let page = 1;
      let hasMore = true;
      let currentData = await tokenRes.json();

      while (hasMore) {
        const items = currentData.data || [];
        if (items.length === 0) break;

        const mapped = items
          .filter((i: any) => BigInt(i.balance || 0) > 0n)
          .map((i: any) => {
            const val = BigInt(i.balance);
            const dec = i.decimals || 18;
            const price = i.current_usd_price || 0;
            const fmt = formatUnits(val, dec);
            return {
              address: i.contract_address,
              symbol: i.symbol || "UNK",
              decimals: dec,
              value: val,
              formatted: parseFloat(fmt).toFixed(4),
              type: "Chainbase",
              price: price,
              usdValue: price * parseFloat(fmt),
              icon_url: i.logos?.[0]?.uri || ""
            };
          });

        apiTokens = [...apiTokens, ...mapped];

        // Pagination Logic: If we got 100 items, there might be more. 
        if (items.length < 100 || page >= 5) { // Cap at 5 pages (500 tokens) to prevent rate limits
          hasMore = false;
        } else {
          page++;
          const nextRes = await fetch(`https://api.chainbase.online/v1/account/tokens?chain_id=${BASE_CHAIN_ID}&address=${address}&limit=100&page=${page}`, options);
          if (nextRes.ok) currentData = await nextRes.json();
          else hasMore = false;
        }
      }

      // --- PHASE 2: Priority Fallback (The "Missing Token" Fix) ---
      // Check which priority tokens were NOT found by the API
      const foundAddresses = new Set(apiTokens.map(t => t.address.toLowerCase()));
      const missingPriority = PRIORITY_TOKENS.filter(p => !foundAddresses.has(p.address.toLowerCase()));

      let fallbackTokens: TokenData[] = [];
      
      if (missingPriority.length > 0) {
        // Fetch balances directly from blockchain for missing tokens
        const results = await readContracts(config, {
          contracts: missingPriority.map(p => ({
            address: p.address as `0x${string}`,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address as `0x${string}`]
          }))
        });

        fallbackTokens = results.map((res, index) => {
          if (res.status === "success" && (res.result as bigint) > 0n) {
            const info = missingPriority[index];
            const val = res.result as bigint;
            const fmt = formatUnits(val, info.decimals);
            // Fallback: Assume $1.00 for stables if price missing, or $0 for others
            const estimatedPrice = ["USDC", "DAI", "USDbC"].includes(info.symbol) ? 1.0 : 0; 

            return {
              address: info.address,
              symbol: info.symbol,
              decimals: info.decimals,
              value: val,
              formatted: parseFloat(fmt).toFixed(4),
              type: "RPC_Fallback",
              price: estimatedPrice,
              usdValue: estimatedPrice * parseFloat(fmt),
              icon_url: info.logo,
              isPriority: true
            };
          }
          return null;
        }).filter(Boolean) as TokenData[];
      }

      // --- PHASE 3: Merge & Price Injection ---
      // If we found Native ETH, verify its price using WETH if available
      if (nativeToken) {
        const weth = [...apiTokens, ...fallbackTokens].find(t => t.symbol === "WETH");
        if (weth?.price) {
          nativeToken.price = weth.price;
          nativeToken.usdValue = weth.price * parseFloat(nativeToken.formatted);
        }
      }

      const allFound = nativeToken 
        ? [nativeToken, ...apiTokens, ...fallbackTokens] 
        : [...apiTokens, ...fallbackTokens];

      // Sort: Priority tokens first, then by Value
      setTokens(allFound.sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1; // Priority top
        return (b.usdValue || 0) - (a.usdValue || 0);
      }));

    } catch (e) {
      console.error("Hybrid Scan Error:", e);
    } finally {
      setIsLoading(false);
      isScanning.current = false;
    }
  }, [address, chainId, config]);

  useEffect(() => { scan(); }, [scan]);

  return { tokens, isLoading, refetch: scan };
}