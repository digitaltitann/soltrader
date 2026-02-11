import { Connection, Keypair } from '@solana/web3.js';
import { JupiterService } from '../services/jupiter';
import { PriceService } from '../services/price';
import { PositionManager } from '../positions';
import { Config, ToolResult } from '../types';
import { getSolBalance } from '../services/solana';
import { logTrade, logWarn } from '../logger';
import { addActivity } from '../activity-log';

export async function buyToken(
  jupiter: JupiterService,
  priceService: PriceService,
  positions: PositionManager,
  connection: Connection,
  wallet: Keypair,
  config: Config,
  params: { mint_address: string; sol_amount: number }
): Promise<ToolResult> {
  try {
    const mint = params.mint_address;
    const solAmount = params.sol_amount;

    // Safety checks
    if (solAmount > config.buyAmountSol * 2) {
      return { success: false, error: `SOL amount ${solAmount} exceeds safety limit (max: ${config.buyAmountSol * 2})` };
    }

    if (positions.hasToken(mint)) {
      return { success: false, error: `Already have a position in ${mint}. Duplicate buy blocked.` };
    }

    if (positions.getOpenCount() >= config.maxConcurrentPositions) {
      return { success: false, error: `Max concurrent positions reached (${config.maxConcurrentPositions})` };
    }

    const balance = await getSolBalance(connection, wallet.publicKey);
    if (balance < solAmount + 0.01) { // Keep 0.01 SOL for fees
      return { success: false, error: `Insufficient balance: ${balance} SOL (need ${solAmount} + fees)` };
    }

    // Get pre-buy price
    const priceData = await priceService.getTokenAnalysis(mint);

    // Execute buy
    const { signature, quote } = await jupiter.buyToken(mint, solAmount);

    // Record position
    const position = positions.addPosition({
      tokenMint: mint,
      tokenSymbol: priceData?.symbol,
      entryPriceUsd: priceData?.priceUsd || 0,
      entrySol: solAmount,
      tokenAmount: parseInt(quote.outAmount),
      currentPriceUsd: priceData?.priceUsd || 0,
      pnlPct: 0,
      pnlUsd: 0,
      status: 'open',
      openedAt: new Date().toISOString(),
      txSignatures: [signature],
    });

    logTrade(`Opened position: ${mint} | ${solAmount} SOL | tx: ${signature}`);
    addActivity('buy', `Bought ${priceData?.symbol || mint.slice(0, 8)} for ${solAmount} SOL`, {
      tokenMint: mint,
      tokenSymbol: priceData?.symbol,
      solAmount,
      txSignature: signature,
    });

    return {
      success: true,
      data: {
        message: `Successfully bought ${priceData?.symbol || mint}`,
        position_id: position.id,
        sol_spent: solAmount,
        tokens_received: quote.outAmount,
        price_impact: quote.priceImpactPct,
        tx_signature: signature,
        solscan_url: `https://solscan.io/tx/${signature}`,
      },
    };
  } catch (err: any) {
    logWarn(`Buy failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}
