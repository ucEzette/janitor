export interface TokenData {
  address: string;
  symbol: string;
  decimals: number;
  value: bigint;
  formatted: string;
  type: "Chainbase" | "RPC_Fallback" | "Imported" | string;
  usdValue?: number;
  price?: number;
  icon_url?: string;
  isCustom?: boolean;
  isPriority?: boolean;
  isImported?: boolean;
}