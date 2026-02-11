export interface Position {
  id: string;
  tokenMint: string;
  tokenSymbol?: string;
  entryPriceUsd: number;
  entrySol: number;
  tokenAmount: number;
  currentPriceUsd: number;
  pnlPct: number;
  pnlUsd: number;
  status: "open" | "partial" | "closed";
  openedAt: string;
  closedAt?: string;
  sourceTweetId?: string;
  txSignatures: string[];
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  type: "buy" | "sell" | "signal" | "error" | "info" | "agent";
  message: string;
  data?: {
    tokenMint?: string;
    tokenSymbol?: string;
    solAmount?: number;
    txSignature?: string;
    pnlPct?: number;
    [key: string]: unknown;
  };
}

export interface DashboardData {
  wallet: {
    publicKey: string;
    solBalance: number;
  };
  stats: {
    totalTrades: number;
    openCount: number;
    closedCount: number;
    winRate: number;
    wins: number;
    losses: number;
    realizedPnlSol: number;
    unrealizedPnlSol: number;
  };
  openPositions: Position[];
  closedPositions: Position[];
  activity: ActivityEntry[];
}
