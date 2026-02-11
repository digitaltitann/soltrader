import { Tool } from '@anthropic-ai/sdk/resources/messages';
import { Connection, Keypair } from '@solana/web3.js';
import { JupiterService } from '../services/jupiter';
import { PriceService } from '../services/price';
import { XClient } from '../services/x-client';
import { PositionManager } from '../positions';
import { Config, ToolResult } from '../types';
import { searchXTweets } from './search-x';
import { analyzeToken } from './analyze-token';
import { buyToken } from './buy-token';
import { sellToken } from './sell-token';
import { getPortfolio } from './portfolio';
import { getWalletBalance } from './wallet';
import { waitTool } from './wait';
import { syncPortfolio } from './sync-portfolio';

// Tool definitions for Claude API
export const toolDefinitions: Tool[] = [
  {
    name: 'search_x_tweets',
    description: 'Search X/Twitter for recent viral tweets about Solana tokens. Returns tweets with engagement metrics and any token contract addresses found in the tweet text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "solana memecoin", "new solana token CA")' },
        min_likes: { type: 'number', description: 'Minimum likes to filter for viral tweets (default: 50)' },
        min_retweets: { type: 'number', description: 'Minimum retweets filter (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_token',
    description: 'Get detailed market data about a Solana token: current price, 24h volume, liquidity, price change. Use this BEFORE buying to assess the token.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mint_address: { type: 'string', description: 'The Solana token mint address to analyze' },
      },
      required: ['mint_address'],
    },
  },
  {
    name: 'buy_token',
    description: 'Buy a Solana token using SOL via Jupiter swap. This executes an actual on-chain trade.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mint_address: { type: 'string', description: 'Token mint address to buy' },
        sol_amount: { type: 'number', description: 'Amount of SOL to spend on this buy' },
      },
      required: ['mint_address', 'sol_amount'],
    },
  },
  {
    name: 'sell_token',
    description: 'Sell a Solana token back to SOL via Jupiter swap. Can sell a percentage of holdings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mint_address: { type: 'string', description: 'Token mint address to sell' },
        percentage: { type: 'number', description: 'Percentage of held tokens to sell, 1-100 (default: 100 = sell all)' },
      },
      required: ['mint_address'],
    },
  },
  {
    name: 'get_portfolio',
    description: 'Get all open trading positions with current prices, P&L percentages, and trade history.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_wallet_balance',
    description: 'Get the current SOL balance of the trading wallet.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'sync_portfolio',
    description: 'Verify all open positions against actual on-chain wallet balances. Cleans up phantom positions (tracked but no tokens in wallet). Call this at the START of each trading cycle to keep the portfolio accurate.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'wait',
    description: 'Pause before the next trading cycle. Use this when there is nothing actionable right now. The agent will resume after the wait.',
    input_schema: {
      type: 'object' as const,
      properties: {
        seconds: { type: 'number', description: 'Seconds to wait, between 10 and 300 (default: 60)' },
      },
      required: [],
    },
  },
];

// Tool executor
export class ToolExecutor {
  private jupiter: JupiterService;
  private priceService: PriceService;
  private xClient: XClient;
  private positions: PositionManager;
  private connection: Connection;
  private wallet: Keypair;
  private config: Config;

  constructor(
    jupiter: JupiterService,
    priceService: PriceService,
    xClient: XClient,
    positions: PositionManager,
    connection: Connection,
    wallet: Keypair,
    config: Config
  ) {
    this.jupiter = jupiter;
    this.priceService = priceService;
    this.xClient = xClient;
    this.positions = positions;
    this.connection = connection;
    this.wallet = wallet;
    this.config = config;
  }

  async execute(toolName: string, params: any): Promise<ToolResult> {
    switch (toolName) {
      case 'search_x_tweets':
        return searchXTweets(this.xClient, params);
      case 'analyze_token':
        return analyzeToken(this.priceService, params);
      case 'buy_token':
        return buyToken(this.jupiter, this.priceService, this.positions, this.connection, this.wallet, this.config, params);
      case 'sell_token':
        return sellToken(this.jupiter, this.positions, this.connection, this.wallet, params);
      case 'get_portfolio':
        return getPortfolio(this.positions, this.priceService);
      case 'get_wallet_balance':
        return getWalletBalance(this.connection, this.wallet);
      case 'sync_portfolio':
        return syncPortfolio(this.positions, this.connection, this.wallet);
      case 'wait':
        return waitTool(params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }
}
