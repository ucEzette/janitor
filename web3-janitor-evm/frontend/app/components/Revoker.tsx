"use client";
import { useState } from 'react';

const MOCK_RISKS = [
  { token: "USDC", spender: "0x892...991", risk: "Unlimited", label: "Unknown Protocol" },
  { token: "WETH", spender: "0x129...abc", risk: "Unlimited", label: "Old Router" }
];

export default function Revoker() {
  const [loading, setLoading] = useState(false);

  const handleRevoke = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      alert("Revoke signatures requested! (Simulated)");
    }, 1500);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
      <div className="p-6 border-b border-slate-700 bg-red-500/5">
        <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
          Critical Risks ({MOCK_RISKS.length})
        </h2>
        <p className="text-sm text-red-200/50 mt-1">These contracts have unlimited access to your funds.</p>
      </div>

      <div className="p-6 space-y-4">
        {MOCK_RISKS.map((r, i) => (
          <div key={i} className="flex items-center justify-between bg-slate-900/50 border border-red-500/20 p-4 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-lg">
                !
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200">{r.token}</span>
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded uppercase tracking-wide">
                    High Risk
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Spender: {r.spender}</p>
              </div>
            </div>
            
            <button className="px-4 py-2 text-sm font-medium text-red-400 hover:text-white hover:bg-red-600 rounded-lg border border-red-500/30 hover:border-red-600 transition-all">
              Revoke
            </button>
          </div>
        ))}
      </div>

      <div className="p-6 border-t border-slate-700">
        <button
          onClick={handleRevoke}
          disabled={loading}
          className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-red-600/10"
        >
          {loading ? "Revoking..." : "Revoke All Risks"}
        </button>
      </div>
    </div>
  );
}