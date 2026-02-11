export interface Config {
  rpcUrl: string;
  walletPrivateKey: string;
  anthropicApiKey: string;
  xBearerToken: string;
  buyAmountSol: number;
  slippageBps: number;
  maxConcurrentPositions: number;
  tradeCooldownMs: number;
  minLiquidityUsd: number;
  maxPriceImpactPct: number;
  pollIntervalMs: number;
  minLikes: number;
  minRetweets: number;
}

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
  status: 'open' | 'partial' | 'closed';
  openedAt: string;
  closedAt?: string;
  sourceTweetId?: string;
  txSignatures: string[];
}

export interface ParsedTweet {
  id: string;
  text: string;
  authorUsername: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  extractedMints: string[];
}

export interface TokenAnalysis {
  mint: string;
  symbol?: string;
  name?: string;
  priceUsd: number;
  priceNative: number;
  volume24h: number;
  liquidityUsd: number;
  priceChange24h: number;
  timestamp: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
}

export interface PositionsData {
  openPositions: Record<string, Position>;
  closedPositions: Position[];
  seenTokens: string[];
  lastUpdated: string;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
