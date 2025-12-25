"use client";
// 1. Standard imports from 'wagmi'
import { useWriteContract } from 'wagmi'; 

// 2. Experimental imports (Batching). 
// Note: If 'useWriteContracts' is not found in your version of wagmi, 
// simply remove this line and the "Try Smart Wallet batch" block below.
import { useWriteContracts } from 'wagmi/experimental'; 

import { parseAbi } from 'viem';
import { TokenData } from '../types';

const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

export function useBurner() {
  // Standard writer for fallback
  const { writeContractAsync } = useWriteContract();
  
  // Experimental batch writer (may be undefined if not supported by your wagmi version)
  const experimental = useWriteContracts ? useWriteContracts() : { writeContractsAsync: undefined };
  const { writeContractsAsync } = experimental;

  const burnTokens = async (tokensToBurn: TokenData[]) => {
    if (tokensToBurn.length === 0) return;

    // --- STRATEGY 1: Smart Wallet Batching (One Signature) ---
    if (writeContractsAsync) {
      try {
        console.log("Attempting Smart Wallet batch...");
        const contracts = tokensToBurn.map(token => ({
          address: token.address as `0x${string}`,
          abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
          functionName: 'transfer',
          args: [DEAD_ADDRESS, token.value]
        }));

        // EIP-5792 Batch Call
        await writeContractsAsync({ contracts });
        return { success: true };

      } catch (err: any) {
        // If user rejects, stop completely. 
        if (err.code === 4001 || err.message?.includes("User rejected")) throw err;
        
        console.warn("Batching failed or not supported. Falling back to sequential.", err);
        // Continue to Strategy 2...
      }
    }

    // --- STRATEGY 2: Sequential Fallback (Standard Wallets) ---
    const failedTokens: TokenData[] = [];

    for (const token of tokensToBurn) {
      try {
        console.log(`Burning ${token.symbol}...`);
        
        // Attempt Standard Transfer
        await writeContractAsync({
          address: token.address as `0x${string}`,
          abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
          functionName: 'transfer',
          args: [DEAD_ADDRESS, token.value]
        });

      } catch (err: any) {
        // If user rejects explicitly, stop the loop
        if (err.code === 4001 || err.message?.includes("User rejected")) break;

        console.warn(`Transfer burn failed for ${token.symbol}. Trying native burn()...`);
        
        try {
          // Attempt Native Burn (if token has burn function)
          await writeContractAsync({
            address: token.address as `0x${string}`,
            abi: parseAbi(['function burn(uint256 amount)']),
            functionName: 'burn',
            args: [token.value]
          });
        } catch (burnErr) {
          console.error(`All burn methods failed for ${token.symbol}`);
          failedTokens.push(token);
        }
      }
    }

    return { 
      success: failedTokens.length === 0, 
      failed: failedTokens 
    };
  };

  return { burnTokens };
}