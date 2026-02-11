import * as readline from 'readline';
import { Connection } from '@solana/web3.js';
import { loadConfig } from './config';
import { loadWallet, getSolBalance, isValidSolanaMint } from './services/solana';
import { JupiterService } from './services/jupiter';
import { PriceService } from './services/price';
import { XClient } from './services/x-client';
import { PositionManager } from './positions';
import { ToolExecutor } from './tools';
import { TradingAgent } from './agent';
import { ApiServer } from './api-server';
import { logInfo, logError, logAgent } from './logger';

async function main() {
  console.log('\n=== SolTrader Agent ===\n');

  // 1. Load config
  const config = loadConfig();
  logInfo('Configuration loaded');

  // 2. Connect to Solana
  const connection = new Connection(config.rpcUrl, 'confirmed');
  logInfo(`RPC: ${config.rpcUrl.split('?')[0]}...`);

  // 3. Load wallet
  const wallet = loadWallet(config.walletPrivateKey);
  const balance = await getSolBalance(connection, wallet.publicKey);
  logInfo(`Wallet: ${wallet.publicKey.toBase58()}`);
  logInfo(`Balance: ${balance} SOL`);

  if (balance < 0.05) {
    logError(`Wallet balance too low (${balance} SOL). Send at least 0.1 SOL to start trading.`);
    logInfo(`Send SOL to: ${wallet.publicKey.toBase58()}`);
    process.exit(1);
  }

  // 4. Initialize services
  const jupiter = new JupiterService(connection, wallet, config.slippageBps, config.maxPriceImpactPct);
  const priceService = new PriceService();
  const xClient = new XClient(config.xBearerToken);
  const positions = new PositionManager();

  // 5. Initialize tool executor + agent
  const toolExecutor = new ToolExecutor(
    jupiter, priceService, xClient, positions,
    connection, wallet, config
  );
  const agent = new TradingAgent(config, toolExecutor);

  // 6. Set up CLI for manual input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'soltrader> ',
  });

  console.log('\nCommands:');
  console.log('  <contract_address>  - Buy a token (agent will analyze first)');
  console.log('  status              - Show open positions');
  console.log('  balance             - Show SOL balance');
  console.log('  exit                - Stop the agent\n');

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === 'exit' || input === 'quit') {
      agent.stop();
      logInfo('Shutting down...');
      rl.close();
      process.exit(0);
    } else if (input === 'status' || input === 'portfolio') {
      const open = positions.getOpenPositions();
      if (open.length === 0) {
        console.log('No open positions.');
      } else {
        console.log('\n=== Open Positions ===');
        for (const pos of open) {
          const symbol = pos.tokenSymbol || pos.tokenMint.slice(0, 8) + '...';
          console.log(`  ${symbol} | Invested: ${pos.entrySol} SOL | P&L: ${pos.pnlPct.toFixed(1)}% | Status: ${pos.status}`);
        }
        console.log('');
      }
    } else if (input === 'balance') {
      const bal = await getSolBalance(connection, wallet.publicKey);
      console.log(`SOL Balance: ${bal}`);
    } else if (isValidSolanaMint(input)) {
      agent.handleManualBuy(input);
    } else {
      console.log('Unknown command. Paste a Solana token address to buy, or type "status", "balance", "exit".');
    }

    rl.prompt();
  });

  // 7. Start dashboard API server
  const apiServer = new ApiServer(positions, priceService, connection, wallet);
  apiServer.start(3001);

  // 8. Start the agent
  logAgent('Starting autonomous trading agent...');
  agent.start();
}

main().catch((err) => {
  logError('Fatal error', err);
  process.exit(1);
});
