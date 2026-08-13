export type WalletResult = {
  id: string;
  phrase: string;
  eth_address: string | null;
  eth_balance: number;
  bsc_address?: string | null;
  bsc_balance?: number;
  btc_address?: string | null;
  btc_balance?: number;
  sol_address: string | null;
  sol_balance: number;
  found_at: string;
};

export type ScanStats = {
  id: string;
  total_phrases: number;
  processed: number;
  found_wallets: number;
  is_running: boolean;
  started_at: string;
  updated_at: string;
};
