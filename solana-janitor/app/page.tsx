"use client";
import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction 
} from "@solana/web3.js";
import { Buffer } from "buffer";

// CONSTANTS
// The official Solana Token Program ID
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// HELPER: Encodes amount for Burn instruction (Little Endian 64-bit)
function encodeAmount(amount: number, decimals: number): Buffer {
  const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));
  const buffer = Buffer.alloc(8);
  // Write BigInt as 64-bit unsigned integer, little-endian
  buffer.writeBigUInt64LE(rawAmount);
  return buffer;
}

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  // STATE
  const [emptyAccounts, setEmptyAccounts] = useState<any[]>([]);
  const [dustAccounts, setDustAccounts] = useState<any[]>([]);
  const [riskyAccounts, setRiskyAccounts] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // ==========================================
  // 1. THE SCANNER (Wrapped in useCallback for Auto-Switching)
  // ==========================================
  const scanWallet = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setMsg("Scanning blockchain...");
    
    // Clear previous state before scanning
    setEmptyAccounts([]);
    setDustAccounts([]);
    setRiskyAccounts([]);

    try {
      const response = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const empty: any[] = [];
      const dust: any[] = [];
      const risky: any[] = [];

      response.value.forEach((item) => {
        const data = item.account.data.parsed.info;
        const amount = data.tokenAmount.uiAmount;
        const decimals = data.tokenAmount.decimals;
        const mint = data.mint;
        const address = item.pubkey;
        const delegate = data.delegate; // Check if someone else has access!
        const delegatedAmount = data.delegatedAmount?.uiAmount || 0;

        const accountObj = {
          pubkey: new PublicKey(address),
          mint: mint,
          amount: amount,
          decimals: decimals,
          delegate: delegate
        };

        // MODULE 1: Empty Accounts
        if (amount === 0) {
          empty.push(accountObj);
        } 
        // MODULE 2: Dust Accounts (Arbitrary limit < 100 for demo, user verifies)
        else if (amount > 0 && amount < 100) { 
          dust.push(accountObj);
        }

        // MODULE 3: Security Risk (Delegated Access)
        if (delegate && delegatedAmount > 0) {
          risky.push({ ...accountObj, delegatedAmount });
        }
      });

      setEmptyAccounts(empty);
      setDustAccounts(dust);
      setRiskyAccounts(risky);
      setMsg(`Scan complete! Found ${empty.length} empty, ${dust.length} dust, and ${risky.length} risky accounts.`);
      
    } catch (error: any) {
      console.error("Scan error:", error);
      setMsg(`Error: ${error?.message || "Scan failed"}`);
    }
    setLoading(false);
  }, [publicKey, connection]);

  // ==========================================
  // AUTO-SWITCH LISTENER
  // ==========================================
  // This watches the wallet. If the user changes accounts, it rescans immediately.
  useEffect(() => {
    if (publicKey) {
      scanWallet();
    } else {
      // Clear data if disconnected
      setEmptyAccounts([]);
      setDustAccounts([]);
      setRiskyAccounts([]);
      setMsg("Please connect your wallet.");
    }
  }, [publicKey, scanWallet]);


  // ==========================================
  // MODULE 1: RECLAIM RENT (Close Empty)
  // ==========================================
  const cleanEmpty = async () => {
    if (!publicKey) return;
    setLoading(true);
    setMsg("Closing empty accounts...");

    try {
      const transaction = new Transaction();
      // Batch limit 10 to be safe
      const batch = emptyAccounts.slice(0, 10);

      batch.forEach((acc) => {
        const keys = [
          { pubkey: acc.pubkey, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false }
        ];
        // Instruction 9: CloseAccount
        transaction.add(new TransactionInstruction({
          keys,
          programId: TOKEN_PROGRAM_ID,
          data: Buffer.from([9]) 
        }));
      });

      const sig = await sendTransaction(transaction, connection);
      setMsg(`Success! Closed ${batch.length} accounts. Sig: ${sig.slice(0, 8)}...`);
      scanWallet(); // Refresh
    } catch (error) {
      console.error(error);
      setMsg("Transaction failed.");
    }
    setLoading(false);
  };

  // ==========================================
  // MODULE 2: DUST DESTROYER (Burn & Close)
  // ==========================================
  const burnAndClose = async (account: any) => {
    if (!publicKey) return;
    if (!confirm(`Are you sure you want to BURN ${account.amount} tokens? This cannot be undone.`)) return;

    setLoading(true);
    setMsg("Burning dust and reclaiming rent...");

    try {
      const transaction = new Transaction();
      
      // Step A: Burn the tokens (Instruction 8)
      const burnKeys = [
        { pubkey: account.pubkey, isSigner: false, isWritable: true }, // Account
        { pubkey: new PublicKey(account.mint), isSigner: false, isWritable: true }, // Mint
        { pubkey: publicKey, isSigner: true, isWritable: false } // Owner
      ];

      // Prepare data: Instruction Index (8) + Amount (8 bytes)
      const amountBuffer = encodeAmount(account.amount, account.decimals);
      const data = Buffer.concat([Buffer.from([8]), amountBuffer]);

      transaction.add(new TransactionInstruction({
        keys: burnKeys,
        programId: TOKEN_PROGRAM_ID,
        data: data
      }));

      // Step B: Close the account (Instruction 9)
      const closeKeys = [
        { pubkey: account.pubkey, isSigner: false, isWritable: true },
        { pubkey: publicKey, isSigner: false, isWritable: true },
        { pubkey: publicKey, isSigner: true, isWritable: false }
      ];
      transaction.add(new TransactionInstruction({
        keys: closeKeys,
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from([9])
      }));

      const sig = await sendTransaction(transaction, connection);
      setMsg(`Burned & Closed! Sig: ${sig.slice(0, 8)}...`);
      scanWallet(); // Refresh
    } catch (error) {
      console.error(error);
      setMsg("Transaction failed.");
    }
    setLoading(false);
  };

  // ==========================================
  // MODULE 3: SECURITY SCRUB (Revoke Delegate)
  // ==========================================
  const revokeAccess = async (account: any) => {
    if (!publicKey) return;
    setLoading(true);
    setMsg("Revoking access...");

    try {
      const transaction = new Transaction();

      // Instruction 13: Revoke
      const keys = [
        { pubkey: account.pubkey, isSigner: false, isWritable: true },
        { pubkey: publicKey, isSigner: true, isWritable: false }
      ];

      transaction.add(new TransactionInstruction({
        keys,
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from([13]) // Index 13 = Revoke
      }));

      const sig = await sendTransaction(transaction, connection);
      setMsg(`Access Revoked! Sig: ${sig.slice(0, 8)}...`);
      scanWallet();
    } catch (error) {
      console.error(error);
      setMsg("Transaction failed.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-5 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-10">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
            Solana Janitor 🧹
          </h1>
          <WalletMultiButton style={{ backgroundColor: '#2563eb' }} />
        </header>

        {/* STATUS BAR */}
        <div className="bg-gray-800 p-4 rounded-xl mb-8 border border-gray-700 flex justify-between items-center">
          <p className="text-gray-300">{msg || "Ready to clean."}</p>
          <button
            onClick={scanWallet}
            disabled={!publicKey || loading}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold transition-all disabled:opacity-50"
          >
            {loading ? "Scanning..." : "Rescan Wallet"}
          </button>
        </div>

        {/* MODULE 1: EMPTY ACCOUNTS */}
        {emptyAccounts.length > 0 && (
          <section className="mb-10 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-green-400">🟢 Empty Accounts ({emptyAccounts.length})</h2>
              <button
                onClick={cleanEmpty}
                disabled={loading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-bold"
              >
                Claim ~{(emptyAccounts.length * 0.002).toFixed(3)} SOL
              </button>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 max-h-40 overflow-y-auto">
              {emptyAccounts.map((acc, i) => (
                <div key={i} className="text-xs text-gray-500 font-mono py-1 border-b border-gray-700 last:border-0">
                  {acc.pubkey.toString()} (Mint: ...{acc.mint.slice(-4)})
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MODULE 3: SECURITY RISKS */}
        {riskyAccounts.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-red-500 mb-4">🔴 Security Risks ({riskyAccounts.length})</h2>
            <div className="grid gap-4">
              {riskyAccounts.map((acc, i) => (
                <div key={i} className="bg-gray-800 border border-red-900/50 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-200">Unknown Delegate Access</p>
                    <p className="text-xs text-gray-500 font-mono">Token: ...{acc.mint.slice(-6)}</p>
                    <p className="text-xs text-red-400">Risk: Can spend {acc.delegatedAmount} tokens</p>
                  </div>
                  <button
                    onClick={() => revokeAccess(acc)}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-bold"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MODULE 2: DUST ACCOUNTS */}
        {dustAccounts.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">🟡 Dust Bin ({dustAccounts.length})</h2>
            <p className="text-sm text-gray-400 mb-4">These accounts have small balances. Burning them destroys the tokens but reclaims the 0.002 SOL rent.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {dustAccounts.map((acc, i) => (
                <div key={i} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                  <div>
                    <p className="text-lg font-bold text-gray-200">{acc.amount} <span className="text-xs text-gray-500">tokens</span></p>
                    <p className="text-xs text-gray-500 font-mono">Mint: ...{acc.mint.slice(-6)}</p>
                  </div>
                  <button
                    onClick={() => burnAndClose(acc)}
                    disabled={loading}
                    className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-black rounded-lg text-xs font-bold"
                  >
                    Burn & Claim
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {emptyAccounts.length === 0 && dustAccounts.length === 0 && riskyAccounts.length === 0 && !loading && (
          <div className="text-center py-20 opacity-50">
            <h3 className="text-2xl font-bold">Your Wallet is Clean! ✨</h3>
          </div>
        )}
      </div>
    </div>
  );
}