import * as dotenv from 'dotenv';
import { Config } from './types';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): Config {
  return {
    rpcUrl: requireEnv('SOLANA_RPC_URL'),
    walletPrivateKey: requireEnv('WALLET_PRIVATE_KEY'),
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
    xBearerToken: requireEnv('X_BEARER_TOKEN'),
    buyAmountSol: parseFloat(optionalEnv('BUY_AMOUNT_SOL', '0.1')),
    slippageBps: parseInt(optionalEnv('SLIPPAGE_BPS', '300')),
    maxConcurrentPositions: parseInt(optionalEnv('MAX_CONCURRENT_POSITIONS', '5')),
    tradeCooldownMs: parseInt(optionalEnv('TRADE_COOLDOWN_MS', '30000')),
    minLiquidityUsd: parseFloat(optionalEnv('MIN_LIQUIDITY_USD', '1000')),
    maxPriceImpactPct: parseFloat(optionalEnv('MAX_PRICE_IMPACT_PCT', '10')),
    pollIntervalMs: parseInt(optionalEnv('POLL_INTERVAL_MS', '60000')),
    minLikes: parseInt(optionalEnv('MIN_LIKES', '50')),
    minRetweets: parseInt(optionalEnv('MIN_RETWEETS', '10')),
  };
}
