import Anthropic from '@anthropic-ai/sdk';
import { Config } from './types';
import { ToolExecutor, toolDefinitions } from './tools';
import { logAgent, logError, logInfo } from './logger';

const SYSTEM_PROMPT = `You are SolTrader, an autonomous Solana trading agent. Your goal is to make profitable trades by finding promising tokens on X (Twitter) and trading them on Solana via Jupiter.

## Your Trading Cycle

Each cycle, you should:
1. Check your wallet balance and current portfolio
2. Search X for viral tweets about Solana tokens (try different queries: "solana memecoin", "new solana token", "$SOL gem", "solana 100x", "solana CA")
3. For any tokens found, analyze them (price, liquidity, volume)
4. Decide whether to buy based on your analysis
5. Check existing positions and decide whether to sell (take profits or cut losses)
6. Wait before starting the next cycle

## Trading Rules (MUST FOLLOW)

- ALWAYS check wallet balance before buying
- ALWAYS analyze a token before buying (check liquidity and price impact)
- NEVER buy a token with less than $1,000 liquidity
- NEVER buy if price impact would be > 10%
- Keep at least 0.05 SOL in wallet for transaction fees
- Take profits: consider selling 50% at 2x, remaining at 3x
- Cut losses: consider selling if down more than 30%
- Diversify: don't put everything in one token
- Be skeptical: not every viral tweet is a good trade

## Decision Making

For each potential trade, think about:
- Is this tweet from a credible source? High engagement?
- Does the token have real liquidity?
- Is the volume healthy or suspicious?
- Am I already overexposed?
- What's my exit plan?

Always explain your reasoning before making a trade. Log your thought process.

## When There's Nothing To Do

If no good opportunities are found, use the wait tool to pause 60-120 seconds before the next cycle. Don't force trades.`;

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

    while (this.running) {
      try {
        await this.runCycle();
      } catch (err: any) {
        logError(`Agent cycle error: ${err.message}`);
        // Wait before retrying after an error
        await new Promise(resolve => setTimeout(resolve, 30000));
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
