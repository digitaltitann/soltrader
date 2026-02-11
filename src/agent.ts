import Anthropic from '@anthropic-ai/sdk';
import { Config } from './types';
import { ToolExecutor, toolDefinitions } from './tools';
import { logAgent, logError, logInfo } from './logger';

const SYSTEM_PROMPT = `You are SolTrader, an autonomous Solana trading agent. Your goal is to make as much money as possible by finding trending tokens on X (Twitter) and trading them on Solana via Jupiter.

## Your Focus

You are hunting for the next big Solana memecoin play. Your primary targets:
- **PumpFun tokens** — new launches trending on X, pump.fun graduated tokens
- **BONK ecosystem** — BONK and related tokens getting buzz
- **Bags** — tokens people are shilling as their "bags" on X
- **Any viral Solana token** — if it's trending and has a contract address, analyze it

## Your Trading Cycle

Each cycle, you should:
1. Check your wallet balance and current portfolio
2. Search X for trending tweets using MULTIPLE different queries each cycle. Rotate through:
   - "pumpfun solana" or "pump.fun new token"
   - "solana memecoin trending"
   - "$BONK" or "bonk solana"
   - "solana bags" or "my bags solana"
   - "solana 100x gem"
   - "solana CA" or "solana contract address"
   - "solana new token launch"
   - "$SOL memecoin just launched"
   Use at least 2-3 different search queries per cycle to cast a wide net.
3. For any tokens found in tweets, analyze them (price, liquidity, volume)
4. Decide whether to buy based on your analysis — act fast on trending tokens, momentum matters
5. Check existing positions — take profits aggressively on pumps, cut losers fast
6. Wait before the next cycle

## Trading Rules (MUST FOLLOW)

- ALWAYS check wallet balance before buying
- ALWAYS analyze a token before buying (check liquidity and price impact)
- NEVER buy a token with less than $5,000 liquidity — low liquidity means huge slippage on sell
- NEVER buy if price impact would be > 5%
- Keep at least 0.05 SOL in wallet for transaction fees
- Take profits: sell 50% at 2x, remaining at 3-5x
- Cut losses: sell if down more than 30%
- Diversify: spread across multiple tokens, don't go all in on one
- Move fast: memecoins pump and dump quickly, speed matters

## CRITICAL: Real P&L = SOL Out vs SOL In

Token price going up does NOT mean you profit. What matters is: did you get more SOL back than you put in? Slippage + fees on BOTH buy and sell eat into profits. A token needs to pump significantly to overcome round-trip costs, especially on low-liquidity tokens. When the sell tool returns results, look at real_pnl_sol — that is your actual profit/loss in SOL. Prefer tokens with higher liquidity (lower slippage) for more reliable profits.

## Decision Making

For each potential trade, think about:
- Is this tweet going viral? High likes/retweets = more incoming buyers
- Is this a PumpFun token that just graduated? Early = better
- Does the token have real liquidity and volume?
- Is the chart trending up or already dumped?
- What's the narrative? Memecoins with strong narratives pump harder
- Am I already overexposed?

Always explain your reasoning. Be aggressive but smart.

## When There's Nothing To Do

If no good opportunities are found, wait 60 seconds and try again with different search queries. The market moves fast.`;

export class TradingAgent {
  private client: Anthropic;
  private toolExecutor: ToolExecutor;
  private config: Config;
  private running: boolean = false;

  constructor(config: Config, toolExecutor: ToolExecutor) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.toolExecutor = toolExecutor;
    this.config = config;
  }

  async start(): Promise<void> {
    this.running = true;
    logAgent('SolTrader agent starting...');
    let consecutiveErrors = 0;

    while (this.running) {
      try {
        await this.runCycle();
        consecutiveErrors = 0; // Reset on success
      } catch (err: any) {
        consecutiveErrors++;
        logError(`Agent cycle error (${consecutiveErrors}): ${err.message}`);
        if (err.stack) logError(`Stack: ${err.stack}`);

        // Exponential backoff: 10s, 20s, 40s, max 120s
        const waitMs = Math.min(10000 * Math.pow(2, consecutiveErrors - 1), 120000);
        logAgent(`Waiting ${waitMs / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));

        // After 5 consecutive errors, wait longer
        if (consecutiveErrors >= 5) {
          logError('Too many consecutive errors. Waiting 5 minutes before next attempt.');
          await new Promise(resolve => setTimeout(resolve, 300000));
          consecutiveErrors = 0; // Reset to try again
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    logAgent('Agent stopping...');
  }

  async handleManualBuy(mintAddress: string): Promise<void> {
    logAgent(`Manual buy requested: ${mintAddress}`);
    await this.runCycle(`The user has manually requested to buy this token: ${mintAddress}. Analyze it first, then buy it if it looks safe (has liquidity, reasonable price impact). Use the configured buy amount.`);
  }

  private async runCycle(userMessage?: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: userMessage || 'Begin your next trading cycle. Check portfolio, search for opportunities, manage positions, then wait before the next cycle.',
      },
    ];

    logAgent('Starting trading cycle...');

    // Agent loop: keep going until Claude stops calling tools
    let iterations = 0;
    const maxIterations = 20; // Safety limit per cycle

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages,
      });

      // Process response content blocks
      const assistantContent: Anthropic.ContentBlock[] = response.content;
      messages.push({ role: 'assistant', content: assistantContent });

      // Log any text blocks (agent reasoning)
      for (const block of assistantContent) {
        if (block.type === 'text' && block.text.trim()) {
          logAgent(block.text);
        }
      }

      // Check if there are tool calls
      const toolUseBlocks = assistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls — cycle is done
        logAgent('Cycle complete (no more tool calls)');
        break;
      }

      // Execute all tool calls and build results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        logAgent(`Calling tool: ${toolUse.name}`);
        const result = await this.toolExecutor.execute(toolUse.name, toolUse.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });

      // If the agent called 'wait', break after executing it (cycle is done)
      if (toolUseBlocks.some(b => b.name === 'wait')) {
        logAgent('Wait tool called — cycle ending');
        break;
      }

      // If stop_reason is end_turn, break
      if (response.stop_reason === 'end_turn') {
        break;
      }
    }

    if (iterations >= maxIterations) {
      logAgent('Cycle hit iteration limit');
    }
  }
}
