"use client";
import { useSendTransaction, useAccount } from 'wagmi';
import { TokenData } from '../types';

// --- CONFIGURATION ---
// 1. Get your 0x API Key from dashboard.0x.org
const ZERO_X_API_KEY = "bf02a451-c424-4eb6-a0ed-20dbda975f0a"; 

// 2. INPUT YOUR CONTRACT ADDRESS HERE
const MY_FEE_CONTRACT = "0x9c84ed136b859b11f10f92133de0457a3e2c497f"; 

const FEE_PERCENTAGE = "0.01"; // 0.01 = 1%

export function useSweepWithFee() {
  const { sendTransactionAsync } = useSendTransaction();
  const { address: userAddress } = useAccount();

  const sweepTokens = async (selectedTokens: TokenData[], targetToken: string = "ETH") => {
    if (!userAddress) return;

    for (const token of selectedTokens) {
      try {
        console.log(`Fetching quote for ${token.symbol}...`);

        // Construct 0x API URL with fee parameters
        const params = new URLSearchParams({
          chainId: "8453", // Base Network
          sellToken: token.address,
          buyToken: targetToken,
          sellAmount: token.value.toString(),
          takerAddress: userAddress, // The user executing the trade
          feeRecipient: MY_FEE_CONTRACT, // <--- 1% fee sent to this address
          buyTokenPercentageFee: FEE_PERCENTAGE, // Sets the fee amount
        });

        const response = await fetch(
          `https://api.0x.org/swap/v1/quote?${params.toString()}`,
          { 
            headers: { 
              '0x-api-key': ZERO_X_API_KEY,
              'accept': 'application/json'
            } 
          }
        );
        
        const quote = await response.json();

        if (quote.reason || !quote.to) {
          console.error(`Skipping ${token.symbol}: ${quote.reason || 'No quote found'}`);
          continue; 
        }

        // Execute the swap
        // 0x handles the logic to send 99% to user and 1% to your contract
        await sendTransactionAsync({
          to: quote.to as `0x${string}`,
          data: quote.data as `0x${string}`,
          value: BigInt(quote.value || "0"),
        });

        console.log(`Successfully swept ${token.symbol}`);
      } catch (err) {
        console.error(`Error sweeping ${token.symbol}:`, err);
      }
    }
  };

  return { sweepTokens };
}